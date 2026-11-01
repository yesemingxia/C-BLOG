#include "controllers/tag_controller.h"

#include "dao/tag_dao.h"
#include "services/auth_service.h"
#include "utils/logger.h"
#include "utils/response.h"
#include "utils/sanitize.h"

#include <boost/json.hpp>

namespace json = boost::json;
namespace http = boost::beast::http;

namespace {

// @cuiruoni+A2：标签接口是公开的，但登录后应能看到 members（以及自己的 private）
void extract_viewer(const http::request<http::string_body>& req,
                    int64_t& viewer_id, bool& is_admin) {
    viewer_id = 0;
    is_admin = false;
    std::string username, role;
    if (auth_service::extract_user_from_token(req, viewer_id, username, role)) {
        is_admin = (role == "admin");
    }
}

} // namespace

// @cuiruoni+获取所有标签列表，LEFT JOIN统计每个标签关联的文章数
static http::response<http::string_body> handle_list_tags(
    const http::request<http::string_body>& req, const RouteParams& params) {
    int64_t viewer_id = 0;
    bool is_admin = false;
    extract_viewer(req, viewer_id, is_admin);

    try {
        json::array arr = tag_dao::list_with_post_count(viewer_id, is_admin);

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

    int64_t tag_id = sanitize::safe_stoll(it->second);
    if (tag_id <= 0) {
        http::response<http::string_body> res{http::status::bad_request, req.version()};
        res.body() = response::error(400, "Invalid tag id");
        res.prepare_payload();
        return res;
    }

    int64_t viewer_id = 0;
    bool is_admin = false;
    extract_viewer(req, viewer_id, is_admin);

    int page = 1, page_size = 10;
    auto page_it = params.query.find("page");
    if (page_it != params.query.end() && !page_it->second.empty()) {
        page = sanitize::safe_stoi(page_it->second, 1);
    }
    auto size_it = params.query.find("page_size");
    if (size_it != params.query.end() && !size_it->second.empty()) {
        page_size = sanitize::safe_stoi(size_it->second, 10);
    }
    page = sanitize::clamp_page(page);
    page_size = sanitize::clamp_page_size(page_size, 10);

    try {
        int total = 0;
        json::array arr = tag_dao::find_posts_by_tag_id(tag_id, viewer_id, is_admin,
                                                        page, page_size, total);

        json::object data;
        data["posts"] = std::move(arr);
        data["total"] = total;
        data["page"] = page;
        data["page_size"] = page_size;
        http::response<http::string_body> res{http::status::ok, req.version()};
        res.body() = response::success(json::value(std::move(data)));
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
