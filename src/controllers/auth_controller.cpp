#include "controllers/auth_controller.h"

#include "db/mysql_pool.h"
#include "db/redis_pool.h"
#include "services/auth_service.h"
#include "utils/config.h"
#include "utils/logger.h"
#include "utils/password.h"
#include "utils/response.h"

#include <boost/json.hpp>
#include <jwt-cpp/traits/boost-json/traits.h>

namespace json = boost::json;
namespace http = boost::beast::http;

static http::response<http::string_body> handle_register(
    const http::request<http::string_body>& req, const RouteParams& params) {
    try {
        auto body = json::parse(req.body()).as_object();
        std::string username = std::string(body["username"].as_string());
        std::string password = std::string(body["password"].as_string());
        std::string email = body.contains("email") ? std::string(body["email"].as_string()) : "";

        if (username.empty() || password.empty()) {
            http::response<http::string_body> res{http::status::bad_request, req.version()};
            res.body() = response::error(400, "Username and password are required");
            res.prepare_payload();
            return res;
        }

        auto sess = MysqlPool::instance().get();
        if (!sess) {
            http::response<http::string_body> res{http::status::internal_server_error, req.version()};
            res.body() = response::error(500, "Database connection failed");
            res.prepare_payload();
            return res;
        }

        auto check = sess->sql("SELECT id FROM users WHERE username = :user")
            .bind("user", username).execute();
        if (check.count() > 0) {
            MysqlPool::instance().release(sess);
            http::response<http::string_body> res{http::status::conflict, req.version()};
            res.body() = response::error(409, "Username already exists");
            res.prepare_payload();
            return res;
        }

        std::string salt = password::generate_salt();
        std::string hash = password::hash_password(password, salt);
        std::string salt_b64 = password::base64_encode(salt);
        std::string hash_b64 = password::base64_encode(hash);

        sess->sql("INSERT INTO users (username, password_hash, salt, email) VALUES (:user, :hash, :salt, :email)")
            .bind("user", username)
            .bind("hash", hash_b64)
            .bind("salt", salt_b64)
            .bind("email", email)
            .execute();

        MysqlPool::instance().release(sess);

        http::response<http::string_body> res{http::status::ok, req.version()};
        res.body() = response::success("Registration successful");
        res.prepare_payload();
        return res;
    } catch (const std::exception& e) {
        spdlog::error("Register error: {}", e.what());
        http::response<http::string_body> res{http::status::bad_request, req.version()};
        res.body() = response::error(400, "Invalid request body");
        res.prepare_payload();
        return res;
    }
}

static http::response<http::string_body> handle_login(
    const http::request<http::string_body>& req, const RouteParams& params) {
    try {
        auto body = json::parse(req.body()).as_object();
        std::string username = std::string(body["username"].as_string());
        std::string password = std::string(body["password"].as_string());

        auto sess = MysqlPool::instance().get();
        if (!sess) {
            http::response<http::string_body> res{http::status::internal_server_error, req.version()};
            res.body() = response::error(500, "Database connection failed");
            res.prepare_payload();
            return res;
        }

        auto result = sess->sql("SELECT id, password_hash, salt, role FROM users WHERE username = :user")
            .bind("user", username).execute();

        auto rows = result.fetchAll();
        if (rows.empty()) {
            MysqlPool::instance().release(sess);
            http::response<http::string_body> res{http::status::unauthorized, req.version()};
            res.body() = response::error(401, "Invalid username or password");
            res.prepare_payload();
            return res;
        }

        auto row = rows[0];
        int64_t user_id = row[0];
        std::string hash_b64 = std::string(row[1]);
        std::string salt_b64 = std::string(row[2]);
        std::string role = std::string(row[3]);

        MysqlPool::instance().release(sess);

        std::string salt = password::base64_decode(salt_b64);
        std::string expected_hash = password::base64_decode(hash_b64);
        std::string actual_hash = password::hash_password(password, salt);

        if (actual_hash != expected_hash) {
            http::response<http::string_body> res{http::status::unauthorized, req.version()};
            res.body() = response::error(401, "Invalid username or password");
            res.prepare_payload();
            return res;
        }

        std::string token = auth_service::generate_token(user_id, username, role);

        json::object data;
        data["token"] = token;
        data["user"] = json::object{
            {"id", user_id},
            {"username", username},
            {"role", role}
        };

        http::response<http::string_body> res{http::status::ok, req.version()};
        res.body() = response::success("Login successful", data);
        res.prepare_payload();
        return res;
    } catch (const std::exception& e) {
        spdlog::error("Login error: {}", e.what());
        http::response<http::string_body> res{http::status::internal_server_error, req.version()};
        res.body() = response::error(500, "Internal server error");
        res.prepare_payload();
        return res;
    }
}

static http::response<http::string_body> handle_logout(
    const http::request<http::string_body>& req, const RouteParams& params) {
    std::string auth_field(req[http::field::authorization]);
    if (auth_field.empty() || auth_field.substr(0, 7) != "Bearer ") {
        http::response<http::string_body> res{http::status::unauthorized, req.version()};
        res.body() = response::error(401, "Missing Authorization header");
        res.prepare_payload();
        return res;
    }

    std::string token = auth_field.substr(7);
    auth_service::blacklist_token(token, Config::instance().jwt_expire_seconds());

    http::response<http::string_body> res{http::status::ok, req.version()};
    res.body() = response::success("Logout successful");
    res.prepare_payload();
    return res;
}

void register_auth_routes(Router& router) {
    router.add_route("POST", "/api/auth/register", handle_register);
    router.add_route("POST", "/api/auth/login", handle_login);
    router.add_route("POST", "/api/auth/logout", handle_logout);
}
