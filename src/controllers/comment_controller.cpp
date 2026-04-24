#include "controllers/comment_controller.h"

#include "db/mysql_pool.h"
#include "utils/logger.h"
#include "utils/mysqlx_helper.h"
#include "utils/response.h"

#include <boost/json.hpp>

namespace json = boost::json;
namespace http = boost::beast::http;

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
    auto sess = MysqlPool::instance().get();
    if (!sess) {
        http::response<http::string_body> res{http::status::internal_server_error, req.version()};
        res.body() = response::error(500, "Database connection failed");
        res.prepare_payload();
        return res;
    }

    try {
        auto result = sess->sql(
            "SELECT id, post_id, author_name, author_email, content, parent_id, created_at "
            "FROM comments WHERE post_id = :pid ORDER BY created_at ASC")
            .bind("pid", post_id).execute();

        json::array arr;
        for (auto row : result) {
            json::object obj;
            obj["id"] = mysqlx_helper::to_json(row[0]);
            obj["post_id"] = mysqlx_helper::to_json(row[1]);
            obj["author_name"] = mysqlx_helper::to_string(row[2]);
            obj["author_email"] = mysqlx_helper::is_null(row, 3) ? "" : mysqlx_helper::to_string(row[3]);
            obj["content"] = mysqlx_helper::to_string(row[4]);
            obj["parent_id"] = mysqlx_helper::is_null(row, 5) ? json::value{} : mysqlx_helper::to_json(row[5]);
            obj["created_at"] = mysqlx_helper::to_string(row[6]);
            arr.push_back(obj);
        }

        MysqlPool::instance().release(sess);

        http::response<http::string_body> res{http::status::ok, req.version()};
        res.body() = response::success(json::object{{"comments", arr}});
        res.prepare_payload();
        return res;
    } catch (const std::exception& e) {
        spdlog::error("List comments error: {}", e.what());
        MysqlPool::instance().release(sess);
        http::response<http::string_body> res{http::status::internal_server_error, req.version()};
        res.body() = response::error(500, "Internal server error");
        res.prepare_payload();
        return res;
    }
}

static http::response<http::string_body> handle_create_comment(
    const http::request<http::string_body>& req, const RouteParams& params) {
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
        std::string author_name = std::string(body["author_name"].as_string());
        std::string content = std::string(body["content"].as_string());
        std::string author_email = body.contains("author_email")
            ? std::string(body["author_email"].as_string()) : "";
        int64_t parent_id = body.contains("parent_id") && !body["parent_id"].is_null()
            ? body["parent_id"].as_int64() : 0;

        auto sess = MysqlPool::instance().get();
        if (!sess) {
            http::response<http::string_body> res{http::status::internal_server_error, req.version()};
            res.body() = response::error(500, "Database connection failed");
            res.prepare_payload();
            return res;
        }

        if (parent_id > 0) {
            sess->sql(
                "INSERT INTO comments (post_id, author_name, author_email, content, parent_id) "
                "VALUES (:pid, :name, :email, :content, :parent)")
                .bind("pid", post_id)
                .bind("name", author_name)
                .bind("email", author_email)
                .bind("content", content)
                .bind("parent", parent_id)
                .execute();
        } else {
            sess->sql(
                "INSERT INTO comments (post_id, author_name, author_email, content) "
                "VALUES (:pid, :name, :email, :content)")
                .bind("pid", post_id)
                .bind("name", author_name)
                .bind("email", author_email)
                .bind("content", content)
                .execute();
        }

        MysqlPool::instance().release(sess);

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
