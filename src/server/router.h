#pragma once

#include <boost/beast/http.hpp>
#include <string>
#include <unordered_map>
#include <functional>
#include <vector>

#include "server/file_slice_body.h"

namespace http = boost::beast::http;

// @cuiruoni+路由参数容器，path存储路径参数（如/api/posts/:id中的id），query存储查询字符串参数
struct RouteParams {
    std::unordered_map<std::string, std::string> path;
    std::unordered_map<std::string, std::string> query;
};

// @cuiruoni+请求处理函数类型，接收原始请求和路由参数，返回HTTP响应
using HandlerFunc = std::function<http::response<http::string_body>(
    const http::request<http::string_body>&, const RouteParams&)>;

// @cuiruoni+中间件函数类型，返回false表示拦截请求（已填充响应），返回true表示放行
using MiddlewareFunc = std::function<bool(
    const http::request<http::string_body>&,
    http::response<http::string_body>&)>;

// @cuiruoni+路由条目，包含HTTP方法、路径模式、路径参数名列表和处理函数
struct Route {
    std::string method;
    std::string pattern;              // @cuiruoni+路径模式，如"/api/posts/:id"，:前缀表示参数段
    std::vector<std::string> param_names; // @cuiruoni+从pattern中提取的参数名列表（去掉:前缀）
    HandlerFunc handler;
};

// @cuiruoni+B10：文件响应。成功时走 file（流式发送），错误/HEAD 时走 text。
struct FileRouteResult {
    bool matched = false;
    bool is_file = false;
    http::response<http::string_body> text;
    http::response<FileSliceBody> file;
};

using FileHandlerFunc = std::function<FileRouteResult(
    const http::request<http::string_body>&, const RouteParams&)>;

struct FileRoute {
    std::string method;
    std::string pattern;
    std::vector<std::string> param_names;
    FileHandlerFunc handler;
};

// @cuiruoni+路由器：管理路由表和中间件链，负责请求分发和路径参数提取
class Router {
public:
    void add_route(const std::string& method, const std::string& pattern, HandlerFunc handler);
    // @cuiruoni+B10：文件路由单独走一条匹配表，避免改动所有现有 JSON handler 的返回类型
    void add_file_route(const std::string& method, const std::string& pattern,
                        FileHandlerFunc handler);
    void add_middleware(MiddlewareFunc mw);

    // @cuiruoni+执行中间件链→路径匹配→调用handler，返回true表示已处理，false表示404
    bool route_request(const http::request<http::string_body>& req,
                       http::response<http::string_body>& res);

    // @cuiruoni+B10：文件路由匹配。未命中返回 false（继续走普通路由）。
    bool route_file_request(const http::request<http::string_body>& req,
                            FileRouteResult& result);

private:
    // @cuiruoni+路径模式匹配，将:参数段提取到params.path中
    bool match_path(const std::string& pattern, const std::vector<std::string>& param_names,
                    const std::string& target, RouteParams& params);
    std::vector<std::string> split_path(const std::string& path);
    // @cuiruoni+从URL target中分离路径和查询字符串，解析查询参数到query map
    std::string extract_query(const std::string& target,
                              std::unordered_map<std::string, std::string>& query);

    std::vector<Route> routes_;              // @cuiruoni+路由表，按注册顺序匹配
    std::vector<FileRoute> file_routes_;     // @cuiruoni+B10：文件响应路由表
    std::vector<MiddlewareFunc> middlewares_; // @cuiruoni+中间件链，按注册顺序执行
};
