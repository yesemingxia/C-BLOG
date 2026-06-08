#include "controllers/comment_controller.h"

#include "db/mysql_pool.h"
#include "services/auth_service.h"
#include "utils/logger.h"
#include "utils/mysqlx_helper.h"
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

    int64_t post_id = std::stoll(it->second);
    auto sess = MysqlPool::instance().acquire();
    if (!sess) {
        http::response<http::string_body> res{http::status::internal_server_error, req.version()};
        res.body() = response::error(500, "Database connection failed");
        res.prepare_payload();
        return res;
    }

    try {
        auto result = sess->sql(
            "SELECT id, post_id, author_name, author_email, content, parent_id, created_at "
            "FROM comments WHERE post_id = ? ORDER BY created_at ASC")
            .bind(post_id).execute();

        json::array arr;
        for (auto row : result) {
            json::object obj;
            obj["id"] = mysqlx_helper::to_json(row[0]);
            obj["post_id"] = mysqlx_helper::to_json(row[1]);
            obj["author_name"] = mysqlx_helper::to_string(row[2]);
            obj["author_email"] = mysqlx_helper::is_null(row, 3) ? "" : mysqlx_helper::to_string(row[3]);
            obj["content"] = mysqlx_helper::to_string(row[4]);
            // @cuiruoni+parent_id为null时返回JSON null，前端据此区分顶级评论和回复
            obj["parent_id"] = mysqlx_helper::is_null(row, 5) ? json::value{} : mysqlx_helper::to_json(row[5]);
            obj["created_at"] = mysqlx_helper::to_string(row[6]);
            arr.push_back(obj);
        }

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

    int64_t post_id = std::stoll(it->second);

    try {
        auto body = json::parse(req.body()).as_object();
        // @cuiruoni+认证用户信息作为评论作者，忽略前端传入的author_name
        std::string author_name = sanitize::truncate(sanitize::clean_text(auth_username), 50);
        std::string content = sanitize::clean_text(
            std::string(body["content"].as_string()));
        std::string author_email = "";
        int64_t parent_id = body.contains("parent_id") && !body["parent_id"].is_null()
            ? body["parent_id"].as_int64() : 0;

        auto sess = MysqlPool::instance().acquire();
        if (!sess) {
            http::response<http::string_body> res{http::status::internal_server_error, req.version()};
            res.body() = response::error(500, "Database connection failed");
            res.prepare_payload();
            return res;
        }

        // @cuiruoni+根据是否有parent_id选择不同SQL，避免插入NULL到非必要字段
        if (parent_id > 0) {
            sess->sql(
                "INSERT INTO comments (post_id, author_name, author_email, content, parent_id) "
                "VALUES (?, ?, ?, ?, ?)")
                .bind(post_id)
                .bind(author_name)
                .bind(author_email)
                .bind(content)
                .bind(parent_id)
                .execute();
        } else {
            sess->sql(
                "INSERT INTO comments (post_id, author_name, author_email, content) "
                "VALUES (?, ?, ?, ?)")
                .bind(post_id)
                .bind(author_name)
                .bind(author_email)
                .bind(content)
                .execute();
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
