#include "middleware/cors_middleware.h"
#include "utils/config.h"

namespace cors_middleware {

// @cuiruoni+CORS中间件：为所有响应添加跨域访问头，允许前端跨域调用API
// @cuiruoni+access_control_max_age设为86400秒（1天），减少浏览器预检请求频率
void cors_handle_request(const http::request<http::string_body>& req,
                         http::response<http::string_body>& res) {
    const std::string allowed_origin = Config::instance().cors_allowed_origin();
    const std::string request_origin = std::string(req[http::field::origin]);
    if (!request_origin.empty() && request_origin == allowed_origin) {
        res.set(http::field::access_control_allow_origin, request_origin);
        res.set(http::field::vary, "Origin");
    }
    res.set(http::field::access_control_allow_methods, "GET, POST, PUT, DELETE, OPTIONS");
    res.set(http::field::access_control_allow_headers, "Content-Type, Authorization");
    res.set(http::field::access_control_max_age, "86400");
}

}
