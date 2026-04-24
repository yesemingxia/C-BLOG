#pragma once

#include <boost/beast/http.hpp>
#include <string>
#include <unordered_map>
#include <functional>
#include <vector>

namespace http = boost::beast::http;

struct RouteParams {
    std::unordered_map<std::string, std::string> path;
    std::unordered_map<std::string, std::string> query;
};

using HandlerFunc = std::function<http::response<http::string_body>(
    const http::request<http::string_body>&, const RouteParams&)>;

using MiddlewareFunc = std::function<bool(
    const http::request<http::string_body>&,
    http::response<http::string_body>&)>;

struct Route {
    std::string method;
    std::string pattern;
    std::vector<std::string> param_names;
    HandlerFunc handler;
};

class Router {
public:
    void add_route(const std::string& method, const std::string& pattern, HandlerFunc handler);
    void add_middleware(MiddlewareFunc mw);

    bool route_request(const http::request<http::string_body>& req,
                       http::response<http::string_body>& res);

private:
    bool match_path(const std::string& pattern, const std::vector<std::string>& param_names,
                    const std::string& target, RouteParams& params);
    std::vector<std::string> split_path(const std::string& path);
    std::string extract_query(const std::string& target,
                              std::unordered_map<std::string, std::string>& query);

    std::vector<Route> routes_;
    std::vector<MiddlewareFunc> middlewares_;
};
