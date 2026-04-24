#include "controllers/search_controller.h"
#include "services/search_service.h"
#include "utils/response.h"

#include <boost/json.hpp>

namespace json = boost::json;
namespace http = boost::beast::http;

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
    auto results = search_service::search(keyword);

    json::object data;
    data["query"] = keyword;
    data["results"] = results;
    data["total"] = static_cast<int>(results.size());

    http::response<http::string_body> res{http::status::ok, req.version()};
    res.body() = response::success(data);
    res.prepare_payload();
    return res;
}

void register_search_routes(Router& router) {
    router.add_route("GET", "/api/search", handle_search);
}
