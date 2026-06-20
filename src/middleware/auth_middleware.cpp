#include "middleware/auth_middleware.h"
#include "services/auth_service.h"
#include "utils/logger.h"
#include "utils/response.h"

// @cuiruoni+JWT鉴权中间件工厂函数，返回MiddlewareFunc
// @cuiruoni+逻辑：OPTIONS预检请求直接放行→检查Authorization头→验证token有效性
// @cuiruoni+注意：此中间件未在main.cpp中全局注册，因为项目有大量公开接口（注册、登录、文章列表等）
// @cuiruoni+各Controller内部手动调用extract_user_from_token/extract_admin_from_token进行认证
// @cuiruoni+若需全局注册，应改为白名单模式：只对受保护路径启用认证检查
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

// @cuiruoni+基于路径白名单的认证中间件，只对受保护路径检查token
// @cuiruoni+公开接口（注册、登录、文章列表等）不在白名单中，直接放行
// @cuiruoni+此中间件作为安全网关，防止新增接口时忘记添加认证检查
MiddlewareFunc create_path_protected_auth_middleware() {
    return [](const http::request<http::string_body>& req,
              http::response<http::string_body>& res) -> bool {
        std::string method(req.method_string());
        // @cuiruoni+OPTIONS和GET请求对公开资源直接放行
        if (method == "OPTIONS") return true;

        std::string target(req.target());
        std::string path = target.substr(0, target.find('?'));

        // @cuiruoni+公开路径白名单：无需认证即可访问
        static const std::vector<std::string> public_prefixes = {
            "/api/auth/register",
            "/api/auth/login",
            "/api/auth/logout",
            "/api/contact",
            "/api/search",
            "/api/tags"
        };

        // @cuiruoni+GET请求对以下路径公开
        if (method == "GET") {
            // @cuiruoni+文章列表和详情公开
            if (path == "/api/posts" || path.find("/api/posts/") == 0) return true;
            // @cuiruoni+当前用户资料（未登录时返回空，由controller处理）
            if (path == "/api/users/profile") return true;
            // @cuiruoni+用户公开资料公开
            if (path.find("/api/users/") == 0 && path.find("/api/users/profile") != 0) return true;
            // @cuiruoni+标签和搜索公开
            if (path.find("/api/tags") == 0) return true;
            if (path.find("/api/search") == 0) return true;
            // @cuiruoni+健康检查公开
            if (path == "/") return true;
        }

        // @cuiruoni+检查公开路径前缀
        for (const auto& prefix : public_prefixes) {
            if (path.find(prefix) == 0) return true;
        }

        // @cuiruoni+非公开路径需要认证
        std::string auth_field(req[http::field::authorization]);
        if (auth_field.empty() || auth_field.substr(0, 7) != "Bearer ") {
            res.result(http::status::unauthorized);
            res.set(http::field::content_type, "application/json");
            res.body() = response::error(401, "Authentication required");
            res.prepare_payload();
            return false;
        }

        std::string token = auth_field.substr(7);
        int64_t user_id = 0;
        std::string username, role;
        if (!auth_service::validate_token(token, user_id, username, role)) {
            res.result(http::status::unauthorized);
            res.set(http::field::content_type, "application/json");
            res.body() = response::error(401, "Invalid or expired token");
            res.prepare_payload();
            return false;
        }

        return true;
    };
}
