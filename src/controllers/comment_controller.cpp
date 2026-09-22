#include "controllers/comment_controller.h"

#include "dao/comment_dao.h"
#include "dao/notification_dao.h"
#include "services/auth_service.h"
#include "services/post_service.h"
#include "utils/logger.h"
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
        if (post.status != "published") {
            int64_t viewer_id = 0;
            std::string viewer_name, viewer_role;
            bool authed = auth_service::extract_user_from_token(req, viewer_id, viewer_name, viewer_role);
            bool is_owner = authed && (viewer_role == "admin" || post.user_id == viewer_id);
            if (!is_owner) {
                http::response<http::string_body> res{http::status::not_found, req.version()};
                res.body() = response::error(404, "Post not found");
                res.prepare_payload();
                return res;
            }
        }

        json::array arr = comment_dao::list_by_post_id(post_id);

        http::response<http::string_body> res{http::status::ok, req.version()};
        res.body() = response::success(json::object{{"comments", arr}});
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
        if (post.status != "published") {
            bool is_owner = auth_role == "admin" || post.user_id == auth_user_id;
            if (!is_owner) {
                http::response<http::string_body> res{http::status::not_found, req.version()};
                res.body() = response::error(404, "Post not found");
                res.prepare_payload();
                return res;
            }
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
        std::string author_email = "";
        int64_t parent_id = body.contains("parent_id") && !body["parent_id"].is_null()
            ? body["parent_id"].as_int64() : 0;

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
                "评论了你的文章《" + post.title + "》", post.title);
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

void register_comment_routes(Router& router) {
    router.add_route("GET", "/api/posts/:id/comments", handle_list_comments);
    router.add_route("POST", "/api/posts/:id/comments", handle_create_comment);
}
