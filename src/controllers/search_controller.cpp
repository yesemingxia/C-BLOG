#include "controllers/search_controller.h"
#include "services/auth_service.h"
#include "services/search_service.h"
#include "utils/response.h"
#include "utils/sanitize.h"

#include <boost/json.hpp>

namespace json = boost::json;
namespace http = boost::beast::http;

// @cuiruoni+搜索处理：从查询参数q获取关键词，调用search_service执行搜索
static http::response<http::string_body> handle_search(
    const http::request<http::string_body>& req, const RouteParams& params) {
    auto it = params.query.find("q");
    if (it == params.query.end() || it->second.empty()) {
        http::response<http::string_body> res{http::status::bad_request, req.version()};
        res.body() = response::error(400, "Missing search query parameter 'q'");
        res.prepare_payload();
        return res;
    }

    std::string keyword = it->second;

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

    // @cuiruoni+A2：搜索按当前登录态过滤可见性（匿名 public；登录 public+members+自己的 private）
    int64_t viewer_id = 0;
    std::string viewer_name, viewer_role;
    bool authed = auth_service::extract_user_from_token(req, viewer_id, viewer_name, viewer_role);
    auto result = search_service::search(keyword, viewer_id, authed && viewer_role == "admin",
                                         page, page_size);

    json::object data;
    data["query"] = keyword;
    data["results"] = std::move(result.results);
    data["total"] = result.total;
    data["page"] = page;
    data["page_size"] = page_size;

    http::response<http::string_body> res{http::status::ok, req.version()};
    // @cuiruoni+B17：缓存命中状态可观测，接口测试据此验证 Redis 缓存/epoch 失效路径
    const char* cache_state = authed ? "bypass"
        : (!result.cache_enabled ? "disabled" : (result.cache_hit ? "hit" : "miss"));
    res.set("X-Search-Cache", cache_state);
    res.body() = response::success(json::value(std::move(data)));
    res.prepare_payload();
    return res;
}

void register_search_routes(Router& router) {
    router.add_route("GET", "/api/search", handle_search);
}
