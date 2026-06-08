#include "middleware/auth_middleware.h"
#include "services/auth_service.h"
#include "utils/logger.h"
#include "utils/response.h"

// @cuiruoni+JWT鉴权中间件工厂函数，返回MiddlewareFunc
// @cuiruoni+逻辑：OPTIONS预检请求直接放行→检查Authorization头→验证token有效性
MiddlewareFunc create_auth_middleware() {
    return [](const http::request<http::string_body>& req,
              http::response<http::string_body>& res) -> bool {
        // @cuiruoni+OPTIONS预检请求直接放行，否则浏览器CORS预检会被拦截
        std::string method(req.method_string());
        if (method == "OPTIONS") return true;

        std::string auth_field(req[http::field::authorization]);
        if (auth_field.empty() || auth_field.substr(0, 7) != "Bearer ") {
            res.result(http::status::unauthorized);
            res.set(http::field::content_type, "application/json");
            res.body() = response::error(401, "Missing or invalid Authorization header");
            res.prepare_payload();
            return false; // @cuiruoni+返回false表示拦截请求，不再执行后续handler
        }

        std::string token = auth_field.substr(7);
        int64_t user_id = 0;
        std::string username, role;
        if (!auth_service::validate_token(token, user_id, username, role)) {
            res.result(http::status::unauthorized);
            res.set(http::field::content_type, "application/json");
            res.body() = response::error(401, "Invalid or expired token");
            res.prepare_payload();
            return false; // @cuiruoni+token无效或已过期/在黑名单中
        }

        return true; // @cuiruoni+token有效，放行请求
    };
}
