#include "controllers/tag_controller.h"

#include "dao/tag_dao.h"
#include "utils/logger.h"
#include "utils/response.h"

#include <boost/json.hpp>

namespace json = boost::json;
namespace http = boost::beast::http;

// @cuiruoni+获取所有标签列表，LEFT JOIN统计每个标签关联的文章数
static http::response<http::string_body> handle_list_tags(
    const http::request<http::string_body>& req, const RouteParams& params) {
    try {
        json::array arr = tag_dao::list_with_post_count();

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

    try {
        json::array arr = tag_dao::find_posts_by_tag_id(tag_id);

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
