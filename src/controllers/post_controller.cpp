#include "controllers/post_controller.h"

#include "services/auth_service.h"
#include "services/post_service.h"
#include "utils/logger.h"
#include "utils/response.h"

#include <boost/json.hpp>

namespace json = boost::json;
namespace http = boost::beast::http;

static bool extract_user_from_token(const http::request<http::string_body>& req,
                                    int64_t& user_id, std::string& username, std::string& role) {
    std::string auth_field(req[http::field::authorization]);
    if (auth_field.empty() || auth_field.substr(0, 7) != "Bearer ") return false;
    std::string token = auth_field.substr(7);
    return auth_service::validate_token(token, user_id, username, role);
}

static http::response<http::string_body> handle_list_posts(
    const http::request<http::string_body>& req, const RouteParams& params) {
    int page = 1, page_size = 10;
    std::string status = "all";

    auto it = params.query.find("page");
    if (it != params.query.end() && !it->second.empty()) page = std::stoi(it->second);
    it = params.query.find("page_size");
    if (it != params.query.end() && !it->second.empty()) page_size = std::stoi(it->second);
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

    int64_t id = std::stoll(it->second);
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

static http::response<http::string_body> handle_create_post(
    const http::request<http::string_body>& req, const RouteParams& params) {
    int64_t user_id = 0;
    std::string username, role;
    if (!extract_user_from_token(req, user_id, username, role)) {
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

        json::object data{{"id", id}};
        http::response<http::string_body> res{http::status::created, req.version()};
        res.body() = response::success("Post created", data);
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

static http::response<http::string_body> handle_update_post(
    const http::request<http::string_body>& req, const RouteParams& params) {
    int64_t user_id = 0;
    std::string username, role;
    if (!extract_user_from_token(req, user_id, username, role)) {
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

    int64_t id = std::stoll(it->second);

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

static http::response<http::string_body> handle_delete_post(
    const http::request<http::string_body>& req, const RouteParams& params) {
    int64_t user_id = 0;
    std::string username, role;
    if (!extract_user_from_token(req, user_id, username, role)) {
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

    int64_t id = std::stoll(it->second);
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

void register_post_routes(Router& router) {
    router.add_route("GET", "/api/posts", handle_list_posts);
    router.add_route("GET", "/api/posts/:id", handle_get_post);
    router.add_route("POST", "/api/posts", handle_create_post);
    router.add_route("PUT", "/api/posts/:id", handle_update_post);
    router.add_route("DELETE", "/api/posts/:id", handle_delete_post);
}
