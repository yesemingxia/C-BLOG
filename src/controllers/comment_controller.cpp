#include "controllers/comment_controller.h"

#include "dao/comment_dao.h"
#include "dao/notification_dao.h"
#include "dao/user_dao.h"
#include "services/auth_service.h"
#include "services/post_service.h"
#include "utils/logger.h"
#include "utils/mentions.h"
#include "utils/response.h"
#include "utils/sanitize.h"

#include <boost/json.hpp>

namespace json = boost::json;
namespace http = boost::beast::http;

// @cuiruoni+获取指定文章的评论列表，按创建时间升序排列
static http::response<http::string_body> handle_list_comments(
    const http::request<http::string_body>& req, const RouteParams& params) {
    auto it = params.path.find("id");
    if (it == params.path.end()) {
        http::response<http::string_body> res{http::status::bad_request, req.version()};
        res.body() = response::error(400, "Missing post id");
        res.prepare_payload();
        return res;
    }

    int64_t post_id = sanitize::safe_stoll(it->second);

    try {
        // @cuiruoni+P0安全修复：草稿的评论列表仅作者/管理员可见，其他人404（防止通过评论泄露草稿）
        auto post = post_service::get_post(post_id, false);
        if (post.id == 0) {
            http::response<http::string_body> res{http::status::not_found, req.version()};
            res.body() = response::error(404, "Post not found");
            res.prepare_payload();
            return res;
        }
        // @cuiruoni+A2：评论列表与文章详情使用同一套可见性判断
        int64_t viewer_id = 0;
        std::string viewer_name, viewer_role;
        auth_service::extract_user_from_token(req, viewer_id, viewer_name, viewer_role);
        if (!post_service::can_view_post(post, viewer_id, viewer_role)) {
            http::response<http::string_body> res{http::status::not_found, req.version()};
            res.body() = response::error(404, "Post not found");
            res.prepare_payload();
            return res;
        }

        // @cuiruoni+B5：评论列表分页；保持 comments 字段不变，新增 total/page/page_size
        int page = 1, page_size = 50;
        auto page_it = params.query.find("page");
        if (page_it != params.query.end() && !page_it->second.empty()) {
            page = sanitize::safe_stoi(page_it->second, 1);
        }
        auto size_it = params.query.find("page_size");
        if (size_it != params.query.end() && !size_it->second.empty()) {
            page_size = sanitize::safe_stoi(size_it->second, 50);
        }
        page = sanitize::clamp_page(page);
        page_size = sanitize::clamp_page_size(page_size, 50);

        int total = 0;
        json::array arr = comment_dao::list_by_post_id(post_id, page, page_size, total);

        json::object data;
        data["comments"] = std::move(arr);
        data["total"] = total;
        data["page"] = page;
        data["page_size"] = page_size;
        http::response<http::string_body> res{http::status::ok, req.version()};
        res.body() = response::success(json::value(std::move(data)));
        res.prepare_payload();
        return res;
    } catch (const std::exception& e) {
        spdlog::error("List comments error: {}", e.what());
        http::response<http::string_body> res{http::status::internal_server_error, req.version()};
        res.body() = response::error(500, "Internal server error");
        res.prepare_payload();
        return res;
    }
}

// @cuiruoni+创建评论：需要token鉴权，从token中获取用户信息作为评论作者
static http::response<http::string_body> handle_create_comment(
    const http::request<http::string_body>& req, const RouteParams& params) {
    // @cuiruoni+认证检查：评论必须登录，防止垃圾评论和注入攻击
    int64_t auth_user_id = 0;
    std::string auth_username, auth_role;
    if (!auth_service::extract_user_from_token(req, auth_user_id, auth_username, auth_role)) {
        http::response<http::string_body> res{http::status::unauthorized, req.version()};
        res.body() = response::error(401, "Authentication required");
        res.prepare_payload();
        return res;
    }

    auto it = params.path.find("id");
    if (it == params.path.end()) {
        http::response<http::string_body> res{http::status::bad_request, req.version()};
        res.body() = response::error(400, "Missing post id");
        res.prepare_payload();
        return res;
    }

    int64_t post_id = sanitize::safe_stoll(it->second);

    try {
        // @cuiruoni+P0安全修复：只允许对已发布文章发表评论（作者/管理员可在自己草稿上评论）
        auto post = post_service::get_post(post_id, false);
        if (post.id == 0) {
            http::response<http::string_body> res{http::status::not_found, req.version()};
            res.body() = response::error(404, "Post not found");
            res.prepare_payload();
            return res;
        }
        // @cuiruoni+A2：private 文章只有作者/管理员能评论，members 需登录
        if (!post_service::can_view_post(post, auth_user_id, auth_role)) {
            http::response<http::string_body> res{http::status::not_found, req.version()};
            res.body() = response::error(404, "Post not found");
            res.prepare_payload();
            return res;
        }

        auto body = json::parse(req.body()).as_object();
        // @cuiruoni+认证用户信息作为评论作者，忽略前端传入的author_name
        std::string author_name = sanitize::truncate(sanitize::clean_text(auth_username), 50);
        std::string content = sanitize::clean_text(
            std::string(body["content"].as_string()));
        // @cuiruoni+评论内容不能为空
        if (content.empty()) {
            http::response<http::string_body> res{http::status::bad_request, req.version()};
            res.body() = response::error(400, "Comment content cannot be empty");
            res.prepare_payload();
            return res;
        }
        // @cuiruoni+B5：作者邮箱从用户资料取，不再永远写空串
        std::string author_email;
        user_dao::find_email_by_id(auth_user_id, author_email);

        int64_t parent_id = body.contains("parent_id") && !body["parent_id"].is_null()
            ? body["parent_id"].as_int64() : 0;
        if (parent_id > 0) {
            int64_t parent_post_id = 0;
            std::string parent_author;
            // @cuiruoni+B5：回复只能挂在本文章的评论下，否则评论树会跨文章错乱
            if (!comment_dao::find_meta(parent_id, parent_post_id, parent_author) ||
                parent_post_id != post_id) {
                http::response<http::string_body> res{http::status::bad_request, req.version()};
                res.body() = response::error(400, "Parent comment does not belong to this post");
                res.prepare_payload();
                return res;
            }
        }

        // @cuiruoni+根据是否有parent_id选择不同DAO方法，避免插入NULL到非必要字段
        int64_t new_comment_id = parent_id > 0
            ? comment_dao::insert_with_parent(post_id, author_name, author_email, content, parent_id)
            : comment_dao::insert(post_id, author_name, author_email, content);

        if (new_comment_id <= 0) {
            http::response<http::string_body> res{http::status::internal_server_error, req.version()};
            res.body() = response::error(500, "Failed to create comment");
            res.prepare_payload();
            return res;
        }

        // @cuiruoni+P1修复：评论成功后通知文章作者（自己评论自己的文章不通知）
        if (post.user_id != auth_user_id) {
            notification_dao::insert(post.user_id, "comment", auth_username,
                "评论了你的文章《" + post.title + "》", post.title, post_id, auth_user_id);
        }

        // @cuiruoni+B12：解析 @用户名 生成 mention 通知；同一用户只通知一次，
        // @cuiruoni+不重复通知文章作者（上面已有 comment 通知），也不通知自己
        for (const auto& target_name : mentions::extract(content)) {
            if (target_name == auth_username) continue;
            int64_t target_id = user_dao::find_id_by_username(target_name);
            if (target_id <= 0 || target_id == post.user_id) continue;
            notification_dao::insert(target_id, "mention", auth_username,
                "在评论中提到了你", post.title, post_id, auth_user_id);
        }

        // @cuiruoni+回传创建后的完整评论对象（与 GET .../comments 的元素同构）：
        // @cuiruoni+前端 Post.tsx 会把它直接追加进评论列表，只返回成功字符串会让列表出现一条空白项
        json::object created = comment_dao::get_by_id(new_comment_id);

        http::response<http::string_body> res{http::status::created, req.version()};
        res.body() = response::success(std::string("Comment created"), created);
        res.prepare_payload();
        return res;
    } catch (const std::exception& e) {
        spdlog::error("Create comment error: {}", e.what());
        http::response<http::string_body> res{http::status::bad_request, req.version()};
        res.body() = response::error(400, "Invalid request body");
        res.prepare_payload();
        return res;
    }
}

// @cuiruoni+B5：作者删除自己的评论（管理员可删任意评论）；子回复由外键级联删除
static http::response<http::string_body> handle_delete_comment(
    const http::request<http::string_body>& req, const RouteParams& params) {
    int64_t user_id = 0;
    std::string username, role;
    if (!auth_service::extract_user_from_token(req, user_id, username, role)) {
        http::response<http::string_body> res{http::status::unauthorized, req.version()};
        res.body() = response::error(401, "Authentication required");
        res.prepare_payload();
        return res;
    }

    auto it = params.path.find("id");
    if (it == params.path.end()) {
        http::response<http::string_body> res{http::status::bad_request, req.version()};
        res.body() = response::error(400, "Missing comment id");
        res.prepare_payload();
        return res;
    }
    int64_t comment_id = sanitize::safe_stoll(it->second);

    int64_t post_id = 0;
    std::string author_name;
    if (!comment_dao::find_meta(comment_id, post_id, author_name)) {
        http::response<http::string_body> res{http::status::not_found, req.version()};
        res.body() = response::error(404, "Comment not found");
        res.prepare_payload();
        return res;
    }
    if (role != "admin" && author_name != username) {
        http::response<http::string_body> res{http::status::forbidden, req.version()};
        res.body() = response::error(403, "You can only delete your own comments");
        res.prepare_payload();
        return res;
    }
    if (!comment_dao::delete_by_id(comment_id)) {
        http::response<http::string_body> res{http::status::internal_server_error, req.version()};
        res.body() = response::error(500, "Failed to delete comment");
        res.prepare_payload();
        return res;
    }

    http::response<http::string_body> res{http::status::ok, req.version()};
    res.body() = response::success(std::string("Comment deleted"));
    res.prepare_payload();
    return res;
}

void register_comment_routes(Router& router) {
    router.add_route("GET", "/api/posts/:id/comments", handle_list_comments);
    router.add_route("POST", "/api/posts/:id/comments", handle_create_comment);
    router.add_route("DELETE", "/api/comments/:id", handle_delete_comment);
}
