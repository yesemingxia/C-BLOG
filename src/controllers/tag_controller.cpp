#include "controllers/tag_controller.h"

#include "db/mysql_pool.h"
#include "utils/logger.h"
#include "utils/mysqlx_helper.h"
#include "utils/response.h"

#include <boost/json.hpp>

namespace json = boost::json;
namespace http = boost::beast::http;

// @cuiruoni+获取所有标签列表，LEFT JOIN统计每个标签关联的文章数
static http::response<http::string_body> handle_list_tags(
    const http::request<http::string_body>& req, const RouteParams& params) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) {
        http::response<http::string_body> res{http::status::internal_server_error, req.version()};
        res.body() = response::error(500, "Database connection failed");
        res.prepare_payload();
        return res;
    }

    try {
        auto result = sess->sql(
            "SELECT t.id, t.name, COUNT(pt.post_id) AS post_count "
            "FROM tags t LEFT JOIN post_tags pt ON t.id = pt.tag_id "
            "GROUP BY t.id, t.name ORDER BY t.name")
            .execute();

        json::array arr;
        for (auto row : result) {
            json::object obj;
            obj["id"] = mysqlx_helper::to_json(row[0]);
            obj["name"] = mysqlx_helper::to_string(row[1]);
            obj["post_count"] = mysqlx_helper::to_json(row[2]);
            arr.push_back(obj);
        }

        http::response<http::string_body> res{http::status::ok, req.version()};
        res.body() = response::success(json::object{{"tags", arr}});
        res.prepare_payload();
        return res;
    } catch (const std::exception& e) {
        spdlog::error("List tags error: {}", e.what());
        http::response<http::string_body> res{http::status::internal_server_error, req.version()};
        res.body() = response::error(500, "Internal server error");
        res.prepare_payload();
        return res;
    }
}

// @cuiruoni+获取指定标签下的文章列表，INNER JOIN只返回有文章的标签
static http::response<http::string_body> handle_tag_posts(
    const http::request<http::string_body>& req, const RouteParams& params) {
    auto it = params.path.find("id");
    if (it == params.path.end()) {
        http::response<http::string_body> res{http::status::bad_request, req.version()};
        res.body() = response::error(400, "Missing tag id");
        res.prepare_payload();
        return res;
    }

    int tag_id = std::stoi(it->second);
    auto sess = MysqlPool::instance().acquire();
    if (!sess) {
        http::response<http::string_body> res{http::status::internal_server_error, req.version()};
        res.body() = response::error(500, "Database connection failed");
        res.prepare_payload();
        return res;
    }

    try {
        auto result = sess->sql(
            "SELECT p.id, p.title, p.summary, p.status, p.view_count, p.created_at "
            "FROM posts p INNER JOIN post_tags pt ON p.id = pt.post_id "
            "WHERE pt.tag_id = ? ORDER BY p.created_at DESC")
            .bind(tag_id).execute();

        json::array arr;
        for (auto row : result) {
            json::object obj;
            obj["id"] = mysqlx_helper::to_json(row[0]);
            obj["title"] = mysqlx_helper::to_string(row[1]);
            obj["summary"] = mysqlx_helper::is_null(row, 2) ? "" : mysqlx_helper::to_string(row[2]);
            obj["status"] = mysqlx_helper::to_string(row[3]);
            obj["view_count"] = mysqlx_helper::to_json(row[4]);
            obj["created_at"] = mysqlx_helper::to_string(row[5]);
            arr.push_back(obj);
        }

        http::response<http::string_body> res{http::status::ok, req.version()};
        res.body() = response::success(json::object{{"posts", arr}});
        res.prepare_payload();
        return res;
    } catch (const std::exception& e) {
        spdlog::error("Tag posts error: {}", e.what());
        http::response<http::string_body> res{http::status::internal_server_error, req.version()};
        res.body() = response::error(500, "Internal server error");
        res.prepare_payload();
        return res;
    }
}

void register_tag_routes(Router& router) {
    router.add_route("GET", "/api/tags", handle_list_tags);
    router.add_route("GET", "/api/tags/:id/posts", handle_tag_posts);
}
