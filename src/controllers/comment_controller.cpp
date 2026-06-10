#include "controllers/comment_controller.h"

#include "dao/comment_dao.h"
#include "services/auth_service.h"
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
        auto body = json::parse(req.body()).as_object();
        // @cuiruoni+认证用户信息作为评论作者，忽略前端传入的author_name
        std::string author_name = sanitize::truncate(sanitize::clean_text(auth_username), 50);
        std::string content = sanitize::clean_text(
            std::string(body["content"].as_string()));
        std::string author_email = "";
        int64_t parent_id = body.contains("parent_id") && !body["parent_id"].is_null()
            ? body["parent_id"].as_int64() : 0;

        // @cuiruoni+根据是否有parent_id选择不同DAO方法，避免插入NULL到非必要字段
        bool ok;
        if (parent_id > 0) {
            ok = comment_dao::insert_with_parent(post_id, author_name, author_email, content, parent_id);
        } else {
            ok = comment_dao::insert(post_id, author_name, author_email, content);
        }

        if (!ok) {
            http::response<http::string_body> res{http::status::internal_server_error, req.version()};
            res.body() = response::error(500, "Failed to create comment");
            res.prepare_payload();
            return res;
        }

        http::response<http::string_body> res{http::status::created, req.version()};
        res.body() = response::success(std::string("Comment created"));
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
