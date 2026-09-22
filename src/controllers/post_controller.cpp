#include "controllers/post_controller.h"

#include "dao/notification_dao.h"
#include "dao/post_dao.h"
#include "services/auth_service.h"
#include "services/post_service.h"
#include "db/redis_pool.h"
#include "utils/logger.h"
#include "utils/response.h"
#include "utils/sanitize.h"

#include <boost/json.hpp>

namespace json = boost::json;
namespace http = boost::beast::http;

// @cuiruoni+文章列表：支持分页（page/page_size）和状态过滤（status），返回文章摘要列表
static http::response<http::string_body> handle_list_posts(
    const http::request<http::string_body>& req, const RouteParams& params) {
    int page = 1, page_size = 10;
    std::string status = "all";

    // @cuiruoni+从查询参数中提取分页和过滤条件
    auto it = params.query.find("page");
    if (it != params.query.end() && !it->second.empty()) page = sanitize::safe_stoi(it->second, 1);
    it = params.query.find("page_size");
    if (it != params.query.end() && !it->second.empty()) page_size = sanitize::safe_stoi(it->second, 10);
    if (page_size > 100) page_size = 100; // @cuiruoni+限制page_size上限，防止大查询
    it = params.query.find("status");
    if (it != params.query.end()) {
        const auto& s = it->second;
        if (s == "all" || s == "draft" || s == "published") {
            status = s;
        }
        // @cuiruoni+非法status值保持默认"all"，不传入数据库
    }

    // @cuiruoni+P0安全修复：匿名用户只能查看已发布文章；
    // 登录用户：draft=自己的草稿，all=已发布+自己的草稿，published=全部已发布
    int64_t viewer_id = 0;
    std::string viewer_name, viewer_role;
    bool authed = auth_service::extract_user_from_token(req, viewer_id, viewer_name, viewer_role);
    if (!authed) {
        status = "published";
    }

    int total = 0;
    auto arr = post_service::list_posts(page, page_size, status, total,
                                        viewer_id, authed && viewer_role == "admin");

    json::object data;
    data["posts"] = arr;
    data["total"] = total;
    data["page"] = page;
    data["page_size"] = page_size;

    http::response<http::string_body> res{http::status::ok, req.version()};
    res.body() = response::success(data);
    res.prepare_payload();
    return res;
}

// @cuiruoni+GET /api/posts/mine → 当前用户自己的全部文章（含草稿）。
// ⚠️ 必须注册在 GET /api/posts/:id 之前，否则 "mine" 会被当作 :id 匹配。
static http::response<http::string_body> handle_mine_posts(
    const http::request<http::string_body>& req, const RouteParams& params) {
    int64_t user_id = 0;
    std::string username, role;
    if (!auth_service::extract_user_from_token(req, user_id, username, role)) {
        http::response<http::string_body> res{http::status::unauthorized, req.version()};
        res.body() = response::error(401, "Authentication required");
        res.prepare_payload();
        return res;
    }

    int page = 1, page_size = 20;
    auto it = params.query.find("page");
    if (it != params.query.end() && !it->second.empty()) page = sanitize::safe_stoi(it->second, 1);
    it = params.query.find("page_size");
    if (it != params.query.end() && !it->second.empty()) page_size = sanitize::safe_stoi(it->second, 20);
    if (page_size > 100) page_size = 100;

    int total = 0;
    auto arr = post_dao::list_by_author(user_id, page, page_size, total);

    json::object data;
    data["posts"] = std::move(arr);
    data["total"] = total;
    data["page"] = page;
    data["page_size"] = page_size;
    http::response<http::string_body> res{http::status::ok, req.version()};
    res.body() = response::success(json::value(std::move(data)));
    res.prepare_payload();
    return res;
}

static http::response<http::string_body> handle_get_post(
    const http::request<http::string_body>& req, const RouteParams& params) {
    auto it = params.path.find("id");
    if (it == params.path.end()) {
        http::response<http::string_body> res{http::status::bad_request, req.version()};
        res.body() = response::error(400, "Missing post id");
        res.prepare_payload();
        return res;
    }

    int64_t id = sanitize::safe_stoll(it->second);
    auto post = post_service::get_post(id, false); // @cuiruoni+先不增加浏览量
    if (post.id == 0) {
        http::response<http::string_body> res{http::status::not_found, req.version()};
        res.body() = response::error(404, "Post not found");
        res.prepare_payload();
        return res;
    }

    // @cuiruoni+P0安全修复：草稿仅作者本人和管理员可见，其他人一律404（不暴露文章存在性）
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

    // @cuiruoni+基于IP的浏览量去重：同一IP对同一文章60秒内只计一次浏览
    if (post.status == "published") {
        // @cuiruoni+P1修复：无X-Real-IP时回退到Session写入的X-Client-IP（TCP对端地址）
        std::string client_ip = req.find("X-Real-IP") != req.end()
            ? std::string(req["X-Real-IP"])
            : (req.find("X-Client-IP") != req.end() ? std::string(req["X-Client-IP"]) : "unknown");
        std::string view_key = "viewed:" + std::to_string(id) + ":" + client_ip;
        auto ctx = RedisPool::instance().acquire();
        if (ctx) {
            redisReply* reply = (redisReply*)redisCommand(ctx.get(), "SET %s 1 EX 60 NX", view_key.c_str());
            bool is_new_view = (reply && reply->type == REDIS_REPLY_STATUS && std::string(reply->str) == "OK");
            freeReplyObject(reply);
            if (is_new_view) {
                post_service::increment_view_count(id);
                post.view_count += 1;
            }
        } else {
            // @cuiruoni+Redis不可用时仍增加浏览量
            post_service::increment_view_count(id);
            post.view_count += 1;
        }
    }

    // @cuiruoni+P1修复：详情返回点赞/收藏/评论统计，以及当前登录用户的点赞/收藏状态
    auto data = post_service::post_to_json(post);
    data["like_count"] = post_dao::count_likes(id);
    data["bookmark_count"] = post_dao::count_bookmarks(id);
    data["comment_count"] = post_dao::count_comments(id);

    int64_t viewer_id = 0;
    std::string viewer_name, viewer_role;
    bool authed = auth_service::extract_user_from_token(req, viewer_id, viewer_name, viewer_role);
    data["liked"] = authed && post_dao::is_liked(id, viewer_id);
    data["bookmarked"] = authed && post_dao::is_bookmarked(id, viewer_id);

    http::response<http::string_body> res{http::status::ok, req.version()};
    res.body() = response::success(data);
    res.prepare_payload();
    return res;
}

// @cuiruoni+点赞：需要登录，只能赞已发布文章，成功后通知作者（P1修复）
static http::response<http::string_body> handle_like_post(
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
        res.body() = response::error(400, "Missing post id");
        res.prepare_payload();
        return res;
    }
    int64_t id = sanitize::safe_stoll(it->second);

    auto post = post_service::get_post(id, false);
    if (post.id == 0 || post.status != "published") {
        http::response<http::string_body> res{http::status::not_found, req.version()};
        res.body() = response::error(404, "Post not found");
        res.prepare_payload();
        return res;
    }

    bool newly_liked = post_dao::add_like(id, user_id);
    if (newly_liked && post.user_id != user_id) {
        notification_dao::insert(post.user_id, "like", username,
            "赞了你的文章《" + post.title + "》", post.title);
    }

    json::object data;
    data["liked"] = true;
    data["like_count"] = post_dao::count_likes(id);
    http::response<http::string_body> res{http::status::ok, req.version()};
    res.body() = response::success("Liked", data);
    res.prepare_payload();
    return res;
}

// @cuiruoni+取消点赞
static http::response<http::string_body> handle_unlike_post(
    const http::request<http::string_body>& req, const RouteParams& params) {
    int64_t user_id = 0;
    std::string username, role;
    if (!auth_service::extract_user_from_token(req, user_id, username, role)) {
        http::response<http::string_body> res{http::status::unauthorized, req.version()};
        res.body() = response::error(401, "Authentication required");
        res.prepare_payload();
        return res;
    }

    int64_t id = sanitize::safe_stoll(params.path.count("id") ? params.path.at("id") : "");
    if (id <= 0) {
        http::response<http::string_body> res{http::status::bad_request, req.version()};
        res.body() = response::error(400, "Invalid post id");
        res.prepare_payload();
        return res;
    }

    post_dao::remove_like(id, user_id);
    json::object data;
    data["liked"] = false;
    data["like_count"] = post_dao::count_likes(id);
    http::response<http::string_body> res{http::status::ok, req.version()};
    res.body() = response::success("Unliked", data);
    res.prepare_payload();
    return res;
}

// @cuiruoni+收藏文章
static http::response<http::string_body> handle_bookmark_post(
    const http::request<http::string_body>& req, const RouteParams& params) {
    int64_t user_id = 0;
    std::string username, role;
    if (!auth_service::extract_user_from_token(req, user_id, username, role)) {
        http::response<http::string_body> res{http::status::unauthorized, req.version()};
        res.body() = response::error(401, "Authentication required");
        res.prepare_payload();
        return res;
    }

    int64_t id = sanitize::safe_stoll(params.path.count("id") ? params.path.at("id") : "");
    if (id <= 0) {
        http::response<http::string_body> res{http::status::bad_request, req.version()};
        res.body() = response::error(400, "Invalid post id");
        res.prepare_payload();
        return res;
    }

    auto post = post_service::get_post(id, false);
    if (post.id == 0 || post.status != "published") {
        http::response<http::string_body> res{http::status::not_found, req.version()};
        res.body() = response::error(404, "Post not found");
        res.prepare_payload();
        return res;
    }

    post_dao::add_bookmark(id, user_id);
    json::object data;
    data["bookmarked"] = true;
    data["bookmark_count"] = post_dao::count_bookmarks(id);
    http::response<http::string_body> res{http::status::ok, req.version()};
    res.body() = response::success("Bookmarked", data);
    res.prepare_payload();
    return res;
}

// @cuiruoni+取消收藏
static http::response<http::string_body> handle_unbookmark_post(
    const http::request<http::string_body>& req, const RouteParams& params) {
    int64_t user_id = 0;
    std::string username, role;
    if (!auth_service::extract_user_from_token(req, user_id, username, role)) {
        http::response<http::string_body> res{http::status::unauthorized, req.version()};
        res.body() = response::error(401, "Authentication required");
        res.prepare_payload();
        return res;
    }

    int64_t id = sanitize::safe_stoll(params.path.count("id") ? params.path.at("id") : "");
    if (id <= 0) {
        http::response<http::string_body> res{http::status::bad_request, req.version()};
        res.body() = response::error(400, "Invalid post id");
        res.prepare_payload();
        return res;
    }

    post_dao::remove_bookmark(id, user_id);
    json::object data;
    data["bookmarked"] = false;
    data["bookmark_count"] = post_dao::count_bookmarks(id);
    http::response<http::string_body> res{http::status::ok, req.version()};
    res.body() = response::success("Bookmark removed", data);
    res.prepare_payload();
    return res;
}

// @cuiruoni+当前用户点赞过的文章列表
static http::response<http::string_body> handle_list_liked_posts(
    const http::request<http::string_body>& req, const RouteParams& params) {
    int64_t user_id = 0;
    std::string username, role;
    if (!auth_service::extract_user_from_token(req, user_id, username, role)) {
        http::response<http::string_body> res{http::status::unauthorized, req.version()};
        res.body() = response::error(401, "Authentication required");
        res.prepare_payload();
        return res;
    }

    int page = 1, page_size = 10;
    auto it = params.query.find("page");
    if (it != params.query.end() && !it->second.empty()) page = sanitize::safe_stoi(it->second, 1);
    it = params.query.find("page_size");
    if (it != params.query.end() && !it->second.empty()) page_size = sanitize::safe_stoi(it->second, 10);
    if (page_size > 100) page_size = 100;

    int total = 0;
    json::array arr = post_dao::list_liked_posts(user_id, page, page_size, total);
    http::response<http::string_body> res{http::status::ok, req.version()};
    res.body() = response::success(json::object{
        {"posts", arr}, {"total", total}, {"page", page}, {"page_size", page_size}});
    res.prepare_payload();
    return res;
}

// @cuiruoni+当前用户收藏过的文章列表
static http::response<http::string_body> handle_list_bookmarked_posts(
    const http::request<http::string_body>& req, const RouteParams& params) {
    int64_t user_id = 0;
    std::string username, role;
    if (!auth_service::extract_user_from_token(req, user_id, username, role)) {
        http::response<http::string_body> res{http::status::unauthorized, req.version()};
        res.body() = response::error(401, "Authentication required");
        res.prepare_payload();
        return res;
    }

    int page = 1, page_size = 10;
    auto it = params.query.find("page");
    if (it != params.query.end() && !it->second.empty()) page = sanitize::safe_stoi(it->second, 1);
    it = params.query.find("page_size");
    if (it != params.query.end() && !it->second.empty()) page_size = sanitize::safe_stoi(it->second, 10);
    if (page_size > 100) page_size = 100;

    int total = 0;
    json::array arr = post_dao::list_bookmarked_posts(user_id, page, page_size, total);
    http::response<http::string_body> res{http::status::ok, req.version()};
    res.body() = response::success(json::object{
        {"posts", arr}, {"total", total}, {"page", page}, {"page_size", page_size}});
    res.prepare_payload();
    return res;
}

// @cuiruoni+创建文章：需要token鉴权，自动渲染Markdown→HTML和生成摘要
static http::response<http::string_body> handle_create_post(
    const http::request<http::string_body>& req, const RouteParams& params) {
    int64_t user_id = 0;
    std::string username, role;
    if (!auth_service::extract_user_from_token(req, user_id, username, role)) {
        http::response<http::string_body> res{http::status::unauthorized, req.version()};
        res.body() = response::error(401, "Unauthorized");
        res.prepare_payload();
        return res;
    }

    try {
        auto body = json::parse(req.body()).as_object();
        auto post = post_service::json_to_post(body);
        // @cuiruoni+必填校验：标题和内容不能为空
        if (post.title.empty()) {
            http::response<http::string_body> res{http::status::bad_request, req.version()};
            res.body() = response::error(400, "Title is required");
            res.prepare_payload();
            return res;
        }
        if (post.content_md.empty()) {
            http::response<http::string_body> res{http::status::bad_request, req.version()};
            res.body() = response::error(400, "Content is required");
            res.prepare_payload();
            return res;
        }
        post.user_id = user_id;
        int64_t id = post_service::create_post(post);
        if (id == 0) {
            http::response<http::string_body> res{http::status::internal_server_error, req.version()};
            res.body() = response::error(500, "Failed to create post");
            res.prepare_payload();
            return res;
        }

        // @cuiruoni+创建成功后查询完整文章数据返回给前端，包含渲染后的HTML和标签
        auto created_post = post_service::get_post(id);
        http::response<http::string_body> res{http::status::created, req.version()};
        res.body() = response::success("Post created", post_service::post_to_json(created_post));
        res.prepare_payload();
        return res;
    } catch (const std::exception& e) {
        spdlog::error("Create post error: {}", e.what());
        http::response<http::string_body> res{http::status::bad_request, req.version()};
        res.body() = response::error(400, "Invalid request body");
        res.prepare_payload();
        return res;
    }
}

// @cuiruoni+更新文章：需要token鉴权，自动重新渲染Markdown→HTML
static http::response<http::string_body> handle_update_post(
    const http::request<http::string_body>& req, const RouteParams& params) {
    int64_t user_id = 0;
    std::string username, role;
    if (!auth_service::extract_user_from_token(req, user_id, username, role)) {
        http::response<http::string_body> res{http::status::unauthorized, req.version()};
        res.body() = response::error(401, "Unauthorized");
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

    int64_t id = sanitize::safe_stoll(it->second);
    if (!post_service::can_modify_post(id, user_id, role)) {
        http::response<http::string_body> res{http::status::forbidden, req.version()};
        res.body() = response::error(403, "Forbidden");
        res.prepare_payload();
        return res;
    }

    try {
        auto body = json::parse(req.body()).as_object();
        auto post = post_service::json_to_post(body);
        if (!post_service::update_post(id, post)) {
            http::response<http::string_body> res{http::status::internal_server_error, req.version()};
            res.body() = response::error(500, "Failed to update post");
            res.prepare_payload();
            return res;
        }

        // @cuiruoni+P0修复：更新后返回完整文章数据，前端可获取新id/内容，避免跳转 /post/undefined
        auto updated = post_service::get_post(id, false);
        http::response<http::string_body> res{http::status::ok, req.version()};
        res.body() = response::success("Post updated", post_service::post_to_json(updated));
        res.prepare_payload();
        return res;
    } catch (const std::exception& e) {
        spdlog::error("Update post error: {}", e.what());
        http::response<http::string_body> res{http::status::bad_request, req.version()};
        res.body() = response::error(400, "Invalid request body");
        res.prepare_payload();
        return res;
    }
}

// @cuiruoni+删除文章：需要token鉴权
static http::response<http::string_body> handle_delete_post(
    const http::request<http::string_body>& req, const RouteParams& params) {
    int64_t user_id = 0;
    std::string username, role;
    if (!auth_service::extract_user_from_token(req, user_id, username, role)) {
        http::response<http::string_body> res{http::status::unauthorized, req.version()};
        res.body() = response::error(401, "Unauthorized");
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

    int64_t id = sanitize::safe_stoll(it->second);
    if (!post_service::can_modify_post(id, user_id, role)) {
        http::response<http::string_body> res{http::status::forbidden, req.version()};
        res.body() = response::error(403, "Forbidden");
        res.prepare_payload();
        return res;
    }

    if (!post_service::delete_post(id)) {
        http::response<http::string_body> res{http::status::internal_server_error, req.version()};
        res.body() = response::error(500, "Failed to delete post");
        res.prepare_payload();
        return res;
    }

    http::response<http::string_body> res{http::status::ok, req.version()};
    res.body() = response::success(std::string("Post deleted"));
    res.prepare_payload();
    return res;
}

// @cuiruoni+注册文章RESTful路由：GET列表/详情，POST创建，PUT更新，DELETE删除
void register_post_routes(Router& router) {
    // @cuiruoni+P1修复：/api/posts/liked、/api/posts/bookmarked 必须先于 /api/posts/:id 注册，
    // 否则会被 :id 路由吞掉
    router.add_route("GET", "/api/posts/liked", handle_list_liked_posts);
    router.add_route("GET", "/api/posts/bookmarked", handle_list_bookmarked_posts);
    router.add_route("GET", "/api/posts/mine", handle_mine_posts);
    router.add_route("GET", "/api/posts", handle_list_posts);
    router.add_route("GET", "/api/posts/:id", handle_get_post);
    router.add_route("POST", "/api/posts", handle_create_post);
    router.add_route("POST", "/api/posts/:id/like", handle_like_post);
    router.add_route("DELETE", "/api/posts/:id/like", handle_unlike_post);
    router.add_route("POST", "/api/posts/:id/bookmark", handle_bookmark_post);
    router.add_route("DELETE", "/api/posts/:id/bookmark", handle_unbookmark_post);
    router.add_route("PUT", "/api/posts/:id", handle_update_post);
    router.add_route("DELETE", "/api/posts/:id", handle_delete_post);
}
