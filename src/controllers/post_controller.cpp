#include "controllers/post_controller.h"

#include "services/auth_service.h"
#include "services/post_service.h"
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
    it = params.query.find("status");
    if (it != params.query.end()) status = it->second;

    int total = 0;
    auto arr = post_service::list_posts(page, page_size, status, total);

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
    auto post = post_service::get_post(id);
    if (post.id == 0) {
        http::response<http::string_body> res{http::status::not_found, req.version()};
        res.body() = response::error(404, "Post not found");
        res.prepare_payload();
        return res;
    }

    http::response<http::string_body> res{http::status::ok, req.version()};
    res.body() = response::success(post_service::post_to_json(post));
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

        http::response<http::string_body> res{http::status::ok, req.version()};
        res.body() = response::success(std::string("Post updated"));
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
    router.add_route("GET", "/api/posts", handle_list_posts);
    router.add_route("GET", "/api/posts/:id", handle_get_post);
    router.add_route("POST", "/api/posts", handle_create_post);
    router.add_route("PUT", "/api/posts/:id", handle_update_post);
    router.add_route("DELETE", "/api/posts/:id", handle_delete_post);
}
