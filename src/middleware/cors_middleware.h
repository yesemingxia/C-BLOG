#pragma once

#include <boost/beast/http.hpp>
#include <algorithm>
#include <string>

#include "utils/config.h"

namespace http = boost::beast::http;

namespace cors_middleware {

// @cuiruoni+B14：多来源 CORS + 视频分片所需的 Content-Range。
// @cuiruoni+模板版本让文件流式响应（FileSliceBody）也能复用同一套头。
template <class Body>
void apply_cors(const http::request<http::string_body>& req,
                http::response<Body>& res) {
    const std::string request_origin = std::string(req[http::field::origin]);
    const auto allowed = Config::instance().cors_allowed_origins();
    if (!request_origin.empty() &&
        std::find(allowed.begin(), allowed.end(), request_origin) != allowed.end()) {
        res.set(http::field::access_control_allow_origin, request_origin);
        res.set(http::field::vary, "Origin");
    }
    res.set(http::field::access_control_allow_methods, "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS");
    res.set(http::field::access_control_allow_headers,
            "Content-Type, Authorization, Content-Range, Range, If-Range");
    // @cuiruoni+B10：前端/播放器需要读到分段与总长度
    res.set(http::field::access_control_expose_headers,
            "Content-Range, Accept-Ranges, Content-Length");
    // @cuiruoni+P2修复：Cookie认证需要显式允许携带凭证
    res.set(http::field::access_control_allow_credentials, "true");
    res.set(http::field::access_control_max_age, "86400");
}

void cors_handle_request(const http::request<http::string_body>& req,
                         http::response<http::string_body>& res);

}
