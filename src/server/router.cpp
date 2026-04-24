#include "server/router.h"

#include "utils/logger.h"

#include <sstream>

void Router::add_route(const std::string& method, const std::string& pattern, HandlerFunc handler) {
    Route route;
    route.method = method;
    route.pattern = pattern;
    route.handler = std::move(handler);

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
    for (auto& mw : middlewares_) {
        if (!mw(req, res)) {
            return true;
        }
    }

    std::string target(req.target());
    RouteParams params;
    std::string path = extract_query(target, params.query);

    std::string method(req.method_string());

    for (const auto& route : routes_) {
        if (route.method != method) continue;
        if (match_path(route.pattern, route.param_names, path, params)) {
            res = route.handler(req, params);
            return true;
        }
    }

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

    if (pat_segs.size() != tgt_segs.size()) return false;

    size_t param_idx = 0;
    for (size_t i = 0; i < pat_segs.size(); ++i) {
        if (!pat_segs[i].empty() && pat_segs[i][0] == ':') {
            if (param_idx < param_names.size()) {
                params.path[param_names[param_idx]] = tgt_segs[i];
                ++param_idx;
            }
        } else if (pat_segs[i] != tgt_segs[i]) {
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
    auto qpos = target.find('?');
    std::string path = (qpos == std::string::npos) ? target : target.substr(0, qpos);

    if (qpos != std::string::npos) {
        std::string qs = target.substr(qpos + 1);
        std::istringstream iss(qs);
        std::string pair;
        while (std::getline(iss, pair, '&')) {
            auto eq = pair.find('=');
            if (eq != std::string::npos) {
                query[pair.substr(0, eq)] = pair.substr(eq + 1);
            } else if (!pair.empty()) {
                query[pair] = "";
            }
        }
    }
    return path;
}
