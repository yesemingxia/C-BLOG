#include "middleware/auth_middleware.h"
#include "services/auth_service.h"
#include "utils/logger.h"
#include "utils/response.h"

MiddlewareFunc create_auth_middleware() {
    return [](const http::request<http::string_body>& req,
              http::response<http::string_body>& res) -> bool {
        std::string method(req.method_string());
        if (method == "OPTIONS") return true;

        std::string auth_field(req[http::field::authorization]);
        if (auth_field.empty() || auth_field.substr(0, 7) != "Bearer ") {
            res.result(http::status::unauthorized);
            res.set(http::field::content_type, "application/json");
            res.body() = response::error(401, "Missing or invalid Authorization header");
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
