#include "controllers/admin_controller.h"

#include "db/mysql_pool.h"
#include "services/auth_service.h"
#include "utils/logger.h"
#include "utils/mysqlx_helper.h"
#include "utils/response.h"

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

    auto sess = MysqlPool::instance().acquire();
    if (!sess) {
        http::response<http::string_body> res{http::status::internal_server_error, req.version()};
        res.body() = response::error(500, "Database connection failed");
        res.prepare_payload();
        return res;
    }

    try {
        // @cuiruoni+分别统计各表记录数，published/draft为文章状态子统计
        auto total_users_result = sess->sql("SELECT COUNT(*) FROM users").execute();
        int64_t total_users = static_cast<int64_t>(total_users_result.fetchOne()[0]);

        auto total_posts_result = sess->sql("SELECT COUNT(*) FROM posts").execute();
        int64_t total_posts = static_cast<int64_t>(total_posts_result.fetchOne()[0]);

        auto total_comments_result = sess->sql("SELECT COUNT(*) FROM comments").execute();
        int64_t total_comments = static_cast<int64_t>(total_comments_result.fetchOne()[0]);

        auto published_posts_result = sess->sql("SELECT COUNT(*) FROM posts WHERE status = 'published'").execute();
        int64_t published_posts = static_cast<int64_t>(published_posts_result.fetchOne()[0]);

        auto draft_posts_result = sess->sql("SELECT COUNT(*) FROM posts WHERE status = 'draft'").execute();
        int64_t draft_posts = static_cast<int64_t>(draft_posts_result.fetchOne()[0]);

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
    if (it != params.query.end() && !it->second.empty()) page = std::stoi(it->second);
    it = params.query.find("page_size");
    if (it != params.query.end() && !it->second.empty()) page_size = std::stoi(it->second);

    auto sess = MysqlPool::instance().acquire();
    if (!sess) {
        http::response<http::string_body> res{http::status::internal_server_error, req.version()};
        res.body() = response::error(500, "Database connection failed");
        res.prepare_payload();
        return res;
    }

    try {
        // @cuiruoni+查询总数用于分页
        auto count_result = sess->sql("SELECT COUNT(*) FROM users").execute();
        int total = static_cast<int>(static_cast<int64_t>(count_result.fetchOne()[0]));

        int offset = (page - 1) * page_size;
        // @cuiruoni+只返回安全字段，排除password_hash和salt
        auto result = sess->sql(
            "SELECT id, username, email, role, created_at FROM users "
            "ORDER BY created_at DESC LIMIT ? OFFSET ?")
            .bind(page_size).bind(offset).execute();

        json::array arr;
        for (auto row : result) {
            json::object obj;
            obj["id"] = mysqlx_helper::to_json(row[0]);
            obj["username"] = mysqlx_helper::to_string(row[1]);
            obj["email"] = mysqlx_helper::is_null(row, 2) ? "" : mysqlx_helper::to_string(row[2]);
            obj["role"] = mysqlx_helper::to_string(row[3]);
            obj["created_at"] = mysqlx_helper::to_string(row[4]);
            arr.push_back(obj);
        }

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

    int64_t target_id = std::stoll(it->second);

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

        auto sess = MysqlPool::instance().acquire();
        if (!sess) {
            http::response<http::string_body> res{http::status::internal_server_error, req.version()};
            res.body() = response::error(500, "Database connection failed");
            res.prepare_payload();
            return res;
        }

        // @cuiruoni+先检查目标用户是否存在
        auto check = sess->sql("SELECT id FROM users WHERE id = ?").bind(target_id).execute();
        if (check.count() == 0) {
                http::response<http::string_body> res{http::status::not_found, req.version()};
            res.body() = response::error(404, "User not found");
            res.prepare_payload();
            return res;
        }

        sess->sql("UPDATE users SET role = ? WHERE id = ?").bind(new_role).bind(target_id).execute();
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

    int64_t target_id = std::stoll(it->second);

    // @cuiruoni+管理员不能删除自己，防止误操作
    if (target_id == admin_id) {
        http::response<http::string_body> res{http::status::bad_request, req.version()};
        res.body() = response::error(400, "Cannot delete yourself");
        res.prepare_payload();
        return res;
    }

    auto sess = MysqlPool::instance().acquire();
    if (!sess) {
        http::response<http::string_body> res{http::status::internal_server_error, req.version()};
        res.body() = response::error(500, "Database connection failed");
        res.prepare_payload();
        return res;
    }

    try {
        // @cuiruoni+先检查目标用户是否存在
        auto check = sess->sql("SELECT id FROM users WHERE id = ?").bind(target_id).execute();
        if (check.count() == 0) {
                http::response<http::string_body> res{http::status::not_found, req.version()};
            res.body() = response::error(404, "User not found");
            res.prepare_payload();
            return res;
        }

        // @cuiruoni+删除用户，依赖数据库外键ON DELETE CASCADE级联删除posts和comments
        sess->sql("DELETE FROM users WHERE id = ?").bind(target_id).execute();
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
    if (it != params.query.end() && !it->second.empty()) page = std::stoi(it->second);
    it = params.query.find("page_size");
    if (it != params.query.end() && !it->second.empty()) page_size = std::stoi(it->second);
    it = params.query.find("status");
    if (it != params.query.end()) status = it->second;

    auto sess = MysqlPool::instance().acquire();
    if (!sess) {
        http::response<http::string_body> res{http::status::internal_server_error, req.version()};
        res.body() = response::error(500, "Database connection failed");
        res.prepare_payload();
        return res;
    }

    try {
        int total = 0;
        std::string count_sql = "SELECT COUNT(*) FROM posts";
        std::string list_sql =
            "SELECT p.id, p.title, p.status, p.view_count, p.created_at, p.updated_at, "
            "u.id, u.username "
            "FROM posts p LEFT JOIN users u ON p.user_id = u.id";

        // @cuiruoni+根据status参数决定是否添加WHERE条件
        if (status != "all") {
            count_sql += " WHERE status = ?";
            list_sql += " WHERE p.status = ? ORDER BY p.created_at DESC LIMIT ? OFFSET ?";
        } else {
            list_sql += " ORDER BY p.created_at DESC LIMIT ? OFFSET ?";
        }

        // @cuiruoni+查询总数用于分页
        if (status != "all") {
            auto count_result = sess->sql(count_sql).bind(status).execute();
            total = static_cast<int>(static_cast<int64_t>(count_result.fetchOne()[0]));
        } else {
            auto count_result = sess->sql(count_sql).execute();
            total = static_cast<int>(static_cast<int64_t>(count_result.fetchOne()[0]));
        }

        int offset = (page - 1) * page_size;

        // @cuiruoni+根据是否有status过滤条件，使用不同的绑定参数
        mysqlx::SqlResult result;
        if (status != "all") {
            result = sess->sql(list_sql).bind(status).bind(page_size).bind(offset).execute();
        } else {
            result = sess->sql(list_sql).bind(page_size).bind(offset).execute();
        }

        json::array arr;
        for (auto row : result) {
            json::object obj;
            obj["id"] = mysqlx_helper::to_json(row[0]);
            obj["title"] = mysqlx_helper::to_string(row[1]);
            obj["status"] = mysqlx_helper::to_string(row[2]);
            obj["view_count"] = mysqlx_helper::to_json(row[3]);
            obj["created_at"] = mysqlx_helper::to_string(row[4]);
            obj["updated_at"] = mysqlx_helper::is_null(row, 5) ? "" : mysqlx_helper::to_string(row[5]);
            // @cuiruoni+作者信息作为嵌套对象返回
            json::object author;
            author["id"] = mysqlx_helper::to_json(row[6]);
            author["username"] = mysqlx_helper::to_string(row[7]);
            obj["author"] = author;
            arr.push_back(obj);
        }

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

    int64_t post_id = std::stoll(it->second);

    auto sess = MysqlPool::instance().acquire();
    if (!sess) {
        http::response<http::string_body> res{http::status::internal_server_error, req.version()};
        res.body() = response::error(500, "Database connection failed");
        res.prepare_payload();
        return res;
    }

    try {
        // @cuiruoni+先检查文章是否存在
        auto check = sess->sql("SELECT id FROM posts WHERE id = ?").bind(post_id).execute();
        if (check.count() == 0) {
                http::response<http::string_body> res{http::status::not_found, req.version()};
            res.body() = response::error(404, "Post not found");
            res.prepare_payload();
            return res;
        }

        // @cuiruoni+管理员可直接删除任意文章，无需检查所有权
        sess->sql("DELETE FROM posts WHERE id = ?").bind(post_id).execute();
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
    if (it != params.query.end() && !it->second.empty()) page = std::stoi(it->second);
    it = params.query.find("page_size");
    if (it != params.query.end() && !it->second.empty()) page_size = std::stoi(it->second);

    auto sess = MysqlPool::instance().acquire();
    if (!sess) {
        http::response<http::string_body> res{http::status::internal_server_error, req.version()};
        res.body() = response::error(500, "Database connection failed");
        res.prepare_payload();
        return res;
    }

    try {
        // @cuiruoni+查询总数用于分页
        auto count_result = sess->sql("SELECT COUNT(*) FROM comments").execute();
        int total = static_cast<int>(static_cast<int64_t>(count_result.fetchOne()[0]));

        int offset = (page - 1) * page_size;
        // @cuiruoni+关联查询评论及其所属文章标题，方便管理员定位
        auto result = sess->sql(
            "SELECT c.id, c.post_id, c.author_name, c.author_email, c.content, "
            "c.parent_id, c.created_at, p.title "
            "FROM comments c LEFT JOIN posts p ON c.post_id = p.id "
            "ORDER BY c.created_at DESC LIMIT ? OFFSET ?")
            .bind(page_size).bind(offset).execute();

        json::array arr;
        for (auto row : result) {
            json::object obj;
            obj["id"] = mysqlx_helper::to_json(row[0]);
            obj["post_id"] = mysqlx_helper::to_json(row[1]);
            obj["author_name"] = mysqlx_helper::to_string(row[2]);
            obj["author_email"] = mysqlx_helper::is_null(row, 3) ? "" : mysqlx_helper::to_string(row[3]);
            obj["content"] = mysqlx_helper::to_string(row[4]);
            // @cuiruoni+parent_id为null时返回JSON null，表示顶级评论
            obj["parent_id"] = mysqlx_helper::is_null(row, 5) ? json::value{} : mysqlx_helper::to_json(row[5]);
            obj["created_at"] = mysqlx_helper::to_string(row[6]);
            // @cuiruoni+所属文章信息作为嵌套对象返回
            json::object post_info;
            post_info["id"] = mysqlx_helper::to_json(row[1]);
            post_info["title"] = mysqlx_helper::is_null(row, 7) ? "" : mysqlx_helper::to_string(row[7]);
            obj["post"] = post_info;
            arr.push_back(obj);
        }

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

    int64_t comment_id = std::stoll(it->second);

    auto sess = MysqlPool::instance().acquire();
    if (!sess) {
        http::response<http::string_body> res{http::status::internal_server_error, req.version()};
        res.body() = response::error(500, "Database connection failed");
        res.prepare_payload();
        return res;
    }

    try {
        // @cuiruoni+先检查评论是否存在
        auto check = sess->sql("SELECT id FROM comments WHERE id = ?").bind(comment_id).execute();
        if (check.count() == 0) {
                http::response<http::string_body> res{http::status::not_found, req.version()};
            res.body() = response::error(404, "Comment not found");
            res.prepare_payload();
            return res;
        }

        sess->sql("DELETE FROM comments WHERE id = ?").bind(comment_id).execute();
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
