#include "controllers/admin_controller.h"

#include "dao/user_dao.h"
#include "dao/post_dao.h"
#include "dao/comment_dao.h"
#include "services/auth_service.h"
#include "utils/logger.h"
#include "utils/response.h"
#include "utils/sanitize.h"

#include <boost/json.hpp>

namespace json = boost::json;
namespace http = boost::beast::http;

// @cuiruoni+管理员仪表盘统计：返回用户数、文章数、评论数、已发布/草稿文章数
static http::response<http::string_body> handle_admin_stats(
    const http::request<http::string_body>& req, const RouteParams& params) {
    int64_t user_id = 0;
    std::string username, role;
    if (!auth_service::extract_admin_from_token(req, user_id, username, role)) {
        http::response<http::string_body> res{http::status::forbidden, req.version()};
        res.body() = response::error(403, "Admin access required");
        res.prepare_payload();
        return res;
    }

    try {
        // @cuiruoni+分别统计各表记录数，published/draft为文章状态子统计
        int64_t total_users = user_dao::count_all();
        int64_t total_posts = post_dao::count_all();
        int64_t total_comments = comment_dao::count_all();
        int64_t published_posts = post_dao::count_by_status("published");
        int64_t draft_posts = post_dao::count_by_status("draft");

            json::object data;
        data["total_users"] = total_users;
        data["total_posts"] = total_posts;
        data["total_comments"] = total_comments;
        data["published_posts"] = published_posts;
        data["draft_posts"] = draft_posts;

        http::response<http::string_body> res{http::status::ok, req.version()};
        res.body() = response::success(data);
        res.prepare_payload();
        return res;
    } catch (const std::exception& e) {
        spdlog::error("Admin stats error: {}", e.what());
        http::response<http::string_body> res{http::status::internal_server_error, req.version()};
        res.body() = response::error(500, "Internal server error");
        res.prepare_payload();
        return res;
    }
}

// @cuiruoni+管理员查看所有用户列表，支持分页，不返回password_hash和salt
static http::response<http::string_body> handle_admin_list_users(
    const http::request<http::string_body>& req, const RouteParams& params) {
    int64_t admin_id = 0;
    std::string username, role;
    if (!auth_service::extract_admin_from_token(req, admin_id, username, role)) {
        http::response<http::string_body> res{http::status::forbidden, req.version()};
        res.body() = response::error(403, "Admin access required");
        res.prepare_payload();
        return res;
    }

    int page = 1, page_size = 10;
    // @cuiruoni+从查询参数中提取分页条件
    auto it = params.query.find("page");
    if (it != params.query.end() && !it->second.empty()) page = sanitize::safe_stoi(it->second);
    it = params.query.find("page_size");
    if (it != params.query.end() && !it->second.empty()) page_size = sanitize::safe_stoi(it->second);

    try {
        int total = 0;
        // @cuiruoni+只返回安全字段，排除password_hash和salt
        json::array arr = user_dao::list_users(page, page_size, total);

            json::object data;
        data["users"] = arr;
        data["total"] = total;
        data["page"] = page;
        data["page_size"] = page_size;

        http::response<http::string_body> res{http::status::ok, req.version()};
        res.body() = response::success(data);
        res.prepare_payload();
        return res;
    } catch (const std::exception& e) {
        spdlog::error("Admin list users error: {}", e.what());
        http::response<http::string_body> res{http::status::internal_server_error, req.version()};
        res.body() = response::error(500, "Internal server error");
        res.prepare_payload();
        return res;
    }
}

// @cuiruoni+管理员修改用户角色，不能修改自己的角色
static http::response<http::string_body> handle_admin_change_user_role(
    const http::request<http::string_body>& req, const RouteParams& params) {
    int64_t admin_id = 0;
    std::string username, role;
    if (!auth_service::extract_admin_from_token(req, admin_id, username, role)) {
        http::response<http::string_body> res{http::status::forbidden, req.version()};
        res.body() = response::error(403, "Admin access required");
        res.prepare_payload();
        return res;
    }

    auto it = params.path.find("id");
    if (it == params.path.end()) {
        http::response<http::string_body> res{http::status::bad_request, req.version()};
        res.body() = response::error(400, "Missing user id");
        res.prepare_payload();
        return res;
    }

    int64_t target_id = sanitize::safe_stoll(it->second);

    // @cuiruoni+管理员不能修改自己的角色，防止误操作导致失去管理员权限
    if (target_id == admin_id) {
        http::response<http::string_body> res{http::status::bad_request, req.version()};
        res.body() = response::error(400, "Cannot change your own role");
        res.prepare_payload();
        return res;
    }

    try {
        auto body = json::parse(req.body()).as_object();
        std::string new_role = std::string(body["role"].as_string());

        // @cuiruoni+只允许admin和user两种角色值
        if (new_role != "admin" && new_role != "user") {
            http::response<http::string_body> res{http::status::bad_request, req.version()};
            res.body() = response::error(400, "Invalid role, must be 'admin' or 'user'");
            res.prepare_payload();
            return res;
        }

        // @cuiruoni+先检查目标用户是否存在
        if (!user_dao::exists_by_id(target_id)) {
                http::response<http::string_body> res{http::status::not_found, req.version()};
            res.body() = response::error(404, "User not found");
            res.prepare_payload();
            return res;
        }

        user_dao::update_role(target_id, new_role);
            http::response<http::string_body> res{http::status::ok, req.version()};
        res.body() = response::success(std::string("User role updated"));
        res.prepare_payload();
        return res;
    } catch (const std::exception& e) {
        spdlog::error("Admin change user role error: {}", e.what());
        http::response<http::string_body> res{http::status::bad_request, req.version()};
        res.body() = response::error(400, "Invalid request body");
        res.prepare_payload();
        return res;
    }
}

// @cuiruoni+管理员删除用户，不能删除自己，依赖数据库外键级联删除关联数据
static http::response<http::string_body> handle_admin_delete_user(
    const http::request<http::string_body>& req, const RouteParams& params) {
    int64_t admin_id = 0;
    std::string username, role;
    if (!auth_service::extract_admin_from_token(req, admin_id, username, role)) {
        http::response<http::string_body> res{http::status::forbidden, req.version()};
        res.body() = response::error(403, "Admin access required");
        res.prepare_payload();
        return res;
    }

    auto it = params.path.find("id");
    if (it == params.path.end()) {
        http::response<http::string_body> res{http::status::bad_request, req.version()};
        res.body() = response::error(400, "Missing user id");
        res.prepare_payload();
        return res;
    }

    int64_t target_id = sanitize::safe_stoll(it->second);

    // @cuiruoni+管理员不能删除自己，防止误操作
    if (target_id == admin_id) {
        http::response<http::string_body> res{http::status::bad_request, req.version()};
        res.body() = response::error(400, "Cannot delete yourself");
        res.prepare_payload();
        return res;
    }

    try {
        // @cuiruoni+先检查目标用户是否存在
        if (!user_dao::exists_by_id(target_id)) {
                http::response<http::string_body> res{http::status::not_found, req.version()};
            res.body() = response::error(404, "User not found");
            res.prepare_payload();
            return res;
        }

        // @cuiruoni+删除用户，依赖数据库外键ON DELETE CASCADE级联删除posts和comments
        user_dao::delete_by_id(target_id);
            http::response<http::string_body> res{http::status::ok, req.version()};
        res.body() = response::success(std::string("User deleted"));
        res.prepare_payload();
        return res;
    } catch (const std::exception& e) {
        spdlog::error("Admin delete user error: {}", e.what());
        http::response<http::string_body> res{http::status::internal_server_error, req.version()};
        res.body() = response::error(500, "Internal server error");
        res.prepare_payload();
        return res;
    }
}

// @cuiruoni+管理员查看所有文章列表（含作者信息），支持分页和状态过滤
static http::response<http::string_body> handle_admin_list_posts(
    const http::request<http::string_body>& req, const RouteParams& params) {
    int64_t admin_id = 0;
    std::string username, role;
    if (!auth_service::extract_admin_from_token(req, admin_id, username, role)) {
        http::response<http::string_body> res{http::status::forbidden, req.version()};
        res.body() = response::error(403, "Admin access required");
        res.prepare_payload();
        return res;
    }

    int page = 1, page_size = 10;
    std::string status = "all";
    // @cuiruoni+从查询参数中提取分页和状态过滤条件
    auto it = params.query.find("page");
    if (it != params.query.end() && !it->second.empty()) page = sanitize::safe_stoi(it->second);
    it = params.query.find("page_size");
    if (it != params.query.end() && !it->second.empty()) page_size = sanitize::safe_stoi(it->second);
    it = params.query.find("status");
    if (it != params.query.end()) status = it->second;

    try {
        int total = 0;
        // @cuiruoni+根据status参数决定是否添加WHERE条件
        json::array arr = post_dao::admin_list_posts(page, page_size, status, total);

            json::object data;
        data["posts"] = arr;
        data["total"] = total;
        data["page"] = page;
        data["page_size"] = page_size;

        http::response<http::string_body> res{http::status::ok, req.version()};
        res.body() = response::success(data);
        res.prepare_payload();
        return res;
    } catch (const std::exception& e) {
        spdlog::error("Admin list posts error: {}", e.what());
        http::response<http::string_body> res{http::status::internal_server_error, req.version()};
        res.body() = response::error(500, "Internal server error");
        res.prepare_payload();
        return res;
    }
}

// @cuiruoni+管理员删除任意文章，不受所有权限制
static http::response<http::string_body> handle_admin_delete_post(
    const http::request<http::string_body>& req, const RouteParams& params) {
    int64_t admin_id = 0;
    std::string username, role;
    if (!auth_service::extract_admin_from_token(req, admin_id, username, role)) {
        http::response<http::string_body> res{http::status::forbidden, req.version()};
        res.body() = response::error(403, "Admin access required");
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
        // @cuiruoni+先检查文章是否存在
        if (!post_dao::exists_by_id(post_id)) {
                http::response<http::string_body> res{http::status::not_found, req.version()};
            res.body() = response::error(404, "Post not found");
            res.prepare_payload();
            return res;
        }

        // @cuiruoni+管理员可直接删除任意文章，无需检查所有权
        post_dao::delete_by_id(post_id);
            http::response<http::string_body> res{http::status::ok, req.version()};
        res.body() = response::success(std::string("Post deleted"));
        res.prepare_payload();
        return res;
    } catch (const std::exception& e) {
        spdlog::error("Admin delete post error: {}", e.what());
        http::response<http::string_body> res{http::status::internal_server_error, req.version()};
        res.body() = response::error(500, "Internal server error");
        res.prepare_payload();
        return res;
    }
}

// @cuiruoni+管理员查看所有评论列表，支持分页，返回评论及所属文章信息
static http::response<http::string_body> handle_admin_list_comments(
    const http::request<http::string_body>& req, const RouteParams& params) {
    int64_t admin_id = 0;
    std::string username, role;
    if (!auth_service::extract_admin_from_token(req, admin_id, username, role)) {
        http::response<http::string_body> res{http::status::forbidden, req.version()};
        res.body() = response::error(403, "Admin access required");
        res.prepare_payload();
        return res;
    }

    int page = 1, page_size = 10;
    // @cuiruoni+从查询参数中提取分页条件
    auto it = params.query.find("page");
    if (it != params.query.end() && !it->second.empty()) page = sanitize::safe_stoi(it->second);
    it = params.query.find("page_size");
    if (it != params.query.end() && !it->second.empty()) page_size = sanitize::safe_stoi(it->second);

    try {
        int total = 0;
        // @cuiruoni+关联查询评论及其所属文章标题，方便管理员定位
        json::array arr = comment_dao::admin_list_comments(page, page_size, total);

            json::object data;
        data["comments"] = arr;
        data["total"] = total;
        data["page"] = page;
        data["page_size"] = page_size;

        http::response<http::string_body> res{http::status::ok, req.version()};
        res.body() = response::success(data);
        res.prepare_payload();
        return res;
    } catch (const std::exception& e) {
        spdlog::error("Admin list comments error: {}", e.what());
        http::response<http::string_body> res{http::status::internal_server_error, req.version()};
        res.body() = response::error(500, "Internal server error");
        res.prepare_payload();
        return res;
    }
}

// @cuiruoni+管理员删除任意评论
static http::response<http::string_body> handle_admin_delete_comment(
    const http::request<http::string_body>& req, const RouteParams& params) {
    int64_t admin_id = 0;
    std::string username, role;
    if (!auth_service::extract_admin_from_token(req, admin_id, username, role)) {
        http::response<http::string_body> res{http::status::forbidden, req.version()};
        res.body() = response::error(403, "Admin access required");
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

    try {
        // @cuiruoni+先检查评论是否存在
        if (!comment_dao::exists_by_id(comment_id)) {
                http::response<http::string_body> res{http::status::not_found, req.version()};
            res.body() = response::error(404, "Comment not found");
            res.prepare_payload();
            return res;
        }

        comment_dao::delete_by_id(comment_id);
            http::response<http::string_body> res{http::status::ok, req.version()};
        res.body() = response::success(std::string("Comment deleted"));
        res.prepare_payload();
        return res;
    } catch (const std::exception& e) {
        spdlog::error("Admin delete comment error: {}", e.what());
        http::response<http::string_body> res{http::status::internal_server_error, req.version()};
        res.body() = response::error(500, "Internal server error");
        res.prepare_payload();
        return res;
    }
}

// @cuiruoni+注册管理员API路由，所有路由在handler内部通过extract_admin_from_token检查权限
void register_admin_routes(Router& router) {
    router.add_route("GET", "/api/admin/stats", handle_admin_stats);
    router.add_route("GET", "/api/admin/users", handle_admin_list_users);
    router.add_route("PUT", "/api/admin/users/:id/role", handle_admin_change_user_role);
    router.add_route("DELETE", "/api/admin/users/:id", handle_admin_delete_user);
    router.add_route("GET", "/api/admin/posts", handle_admin_list_posts);
    router.add_route("DELETE", "/api/admin/posts/:id", handle_admin_delete_post);
    router.add_route("GET", "/api/admin/comments", handle_admin_list_comments);
    router.add_route("DELETE", "/api/admin/comments/:id", handle_admin_delete_comment);
}
