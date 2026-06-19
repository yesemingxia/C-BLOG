#include "server/router.h"

#include "utils/logger.h"

#include <sstream>

// @cuiruoni+URL解码，处理%XX编码和+号转空格
static std::string url_decode(const std::string& str) {
    std::string result;
    for (size_t i = 0; i < str.size(); ++i) {
        if (str[i] == '%' && i + 2 < str.size()) {
            int hex = 0;
            std::istringstream iss(str.substr(i + 1, 2));
            if (iss >> std::hex >> hex) {
                result += static_cast<char>(hex);
                i += 2;
                continue;
            }
        } else if (str[i] == '+') {
            result += ' ';
            continue;
        }
        result += str[i];
    }
    return result;
}

void Router::add_route(const std::string& method, const std::string& pattern, HandlerFunc handler) {
    Route route;
    route.method = method;
    route.pattern = pattern;
    route.handler = std::move(handler);

    // @cuiruoni+扫描路径模式，提取以:开头的段作为参数名（如:id→id）
    auto segments = split_path(pattern);
    route.param_names.clear();
    for (const auto& seg : segments) {
        if (!seg.empty() && seg[0] == ':') {
            route.param_names.push_back(seg.substr(1));
        }
    }

    routes_.push_back(std::move(route));
    spdlog::debug("Route registered: {} {}", method, pattern);
}

void Router::add_middleware(MiddlewareFunc mw) {
    middlewares_.push_back(std::move(mw));
}

bool Router::route_request(const http::request<http::string_body>& req,
                           http::response<http::string_body>& res) {
    // @cuiruoni+先执行中间件链，任一中间件返回false即拦截请求
    for (auto& mw : middlewares_) {
        if (!mw(req, res)) {
            return true;
        }
    }

    std::string target(req.target());
    RouteParams params;
    // @cuiruoni+分离路径和查询字符串，查询参数解析到params.query
    std::string path = extract_query(target, params.query);

    std::string method(req.method_string());

    // @cuiruoni+遍历路由表，按注册顺序匹配方法和路径模式
    for (const auto& route : routes_) {
        if (route.method != method) continue;
        if (match_path(route.pattern, route.param_names, path, params)) {
            auto handler_res = route.handler(req, params);
            // @cuiruoni+合并handler响应到现有res_中，保留已设置的CORS等头信息
            res.result(handler_res.result());
            res.reason(handler_res.reason());
            res.body() = std::move(handler_res.body());
            for (auto it = handler_res.begin(); it != handler_res.end(); ++it) {
                // @cuiruoni+只设置handler返回的头，不覆盖已有的CORS头
                if (res.find(it->name_string()) == res.end()) {
                    res.set(it->name_string(), it->value());
                }
            }
            return true;
        }
    }

    // @cuiruoni+无匹配路由，返回统一404响应
    res.version(req.version());
    res.result(http::status::not_found);
    res.set(http::field::content_type, "application/json");
    res.body() = R"({"code":404,"message":"Not Found","data":null})";
    res.prepare_payload();
    return false;
}

bool Router::match_path(const std::string& pattern, const std::vector<std::string>& param_names,
                        const std::string& target, RouteParams& params) {
    auto pat_segs = split_path(pattern);
    auto tgt_segs = split_path(target);

    // @cuiruoni+路径段数必须一致才可能匹配
    if (pat_segs.size() != tgt_segs.size()) return false;

    size_t param_idx = 0;
    for (size_t i = 0; i < pat_segs.size(); ++i) {
        if (!pat_segs[i].empty() && pat_segs[i][0] == ':') {
            // @cuiruoni+参数段：将实际路径值绑定到对应参数名
            if (param_idx < param_names.size()) {
                params.path[param_names[param_idx]] = tgt_segs[i];
                ++param_idx;
            }
        } else if (pat_segs[i] != tgt_segs[i]) {
            // @cuiruoni+静态段：必须精确匹配
            return false;
        }
    }
    return true;
}

std::vector<std::string> Router::split_path(const std::string& path) {
    std::vector<std::string> segments;
    std::string p = path;
    if (!p.empty() && p[0] == '/') p = p.substr(1);
    std::istringstream iss(p);
    std::string seg;
    while (std::getline(iss, seg, '/')) {
        if (!seg.empty()) segments.push_back(seg);
    }
    return segments;
}

std::string Router::extract_query(const std::string& target,
                                  std::unordered_map<std::string, std::string>& query) {
    // @cuiruoni+以?为界分离路径和查询字符串
    auto qpos = target.find('?');
    std::string path = (qpos == std::string::npos) ? target : target.substr(0, qpos);

    if (qpos != std::string::npos) {
        // @cuiruoni+解析key=value格式查询参数，&分隔，无=的键值设为空字符串
        std::string qs = target.substr(qpos + 1);
        std::istringstream iss(qs);
        std::string pair;
        while (std::getline(iss, pair, '&')) {
            auto eq = pair.find('=');
            if (eq != std::string::npos) {
                query[url_decode(pair.substr(0, eq))] = url_decode(pair.substr(eq + 1));
            } else if (!pair.empty()) {
                query[pair] = "";
            }
        }
    }
    return path;
}
