#include "controllers/auth_controller.h"

#include "db/mysql_pool.h"
#include "db/redis_pool.h"
#include "services/auth_service.h"
#include "utils/config.h"
#include "utils/logger.h"
#include "utils/password.h"
#include "utils/response.h"
#include "utils/sanitize.h"

#include <boost/json.hpp>
#include <jwt-cpp/traits/boost-json/traits.h>

namespace json = boost::json;
namespace http = boost::beast::http;

// @cuiruoni+注册处理：校验参数→查重→生成盐+哈希→Base64编码存储
static http::response<http::string_body> handle_register(
    const http::request<http::string_body>& req, const RouteParams& params) {
    try {
        auto body = json::parse(req.body()).as_object();
        // @cuiruoni+输入消毒：转义HTML特殊字符防止XSS，截断过长字段
        std::string username = sanitize::truncate(sanitize::clean_text(
            std::string(body["username"].as_string())), 50);
        std::string password = std::string(body["password"].as_string());
        std::string email = body.contains("email")
            ? sanitize::truncate(sanitize::clean_text(
                std::string(body["email"].as_string())), 100) : "";

        if (username.empty() || password.empty()) {
            http::response<http::string_body> res{http::status::bad_request, req.version()};
            res.body() = response::error(400, "Username and password are required");
            res.prepare_payload();
            return res;
        }

        auto sess = MysqlPool::instance().acquire();
        if (!sess) {
            http::response<http::string_body> res{http::status::internal_server_error, req.version()};
            res.body() = response::error(500, "Database connection failed");
            res.prepare_payload();
            return res;
        }

        // @cuiruoni+先查询用户名是否已存在，防止唯一约束冲突
        auto check = sess->sql("SELECT id FROM users WHERE username = ?")
            .bind(username).execute();
        if (check.count() > 0) {
            http::response<http::string_body> res{http::status::conflict, req.version()};
            res.body() = response::error(409, "Username already exists");
            res.prepare_payload();
            return res;
        }

        // @cuiruoni+密码加盐哈希：生成随机盐→PBKDF2哈希→Base64编码后存储，避免明文存储
        std::string salt = password::generate_salt();
        std::string hash = password::hash_password(password, salt);
        std::string salt_b64 = password::base64_encode(salt);
        std::string hash_b64 = password::base64_encode(hash);

        sess->sql("INSERT INTO users (username, password_hash, salt, email) VALUES (?, ?, ?, ?)")
            .bind(username)
            .bind(hash_b64)
            .bind(salt_b64)
            .bind(email)
            .execute();

        // @cuiruoni+获取新插入用户的ID
        auto id_result = sess->sql("SELECT LAST_INSERT_ID()").execute();
        auto id_row = id_result.fetchOne();
        int64_t user_id = static_cast<int64_t>(id_row[0]);

        // @cuiruoni+注册成功后自动生成JWT token，前端可直接登录态
        std::string token = auth_service::generate_token(user_id, username, "user");

        json::object data;
        data["token"] = token;
        data["user"] = json::object{
            {"id", user_id},
            {"username", username},
            {"email", email}
        };

        http::response<http::string_body> res{http::status::ok, req.version()};
        res.body() = response::success("Registration successful", data);
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

// @cuiruoni+登录处理：支持用户名或邮箱登录→解码盐和哈希→验证密码→生成JWT token返回
static http::response<http::string_body> handle_login(
    const http::request<http::string_body>& req, const RouteParams& params) {
    try {
        auto body = json::parse(req.body()).as_object();

        // @cuiruoni+兼容前端传email或username字段，优先使用username
        std::string username;
        if (body.contains("username") && !body["username"].is_null()) {
            username = sanitize::truncate(sanitize::clean_text(
                std::string(body["username"].as_string())), 100);
        } else if (body.contains("email") && !body["email"].is_null()) {
            username = sanitize::truncate(sanitize::clean_text(
                std::string(body["email"].as_string())), 100);
        }

        std::string password = std::string(body["password"].as_string());

        if (username.empty() || password.empty()) {
            http::response<http::string_body> res{http::status::bad_request, req.version()};
            res.body() = response::error(400, "Username/email and password are required");
            res.prepare_payload();
            return res;
        }

        auto sess = MysqlPool::instance().acquire();
        if (!sess) {
            http::response<http::string_body> res{http::status::internal_server_error, req.version()};
            res.body() = response::error(500, "Database connection failed");
            res.prepare_payload();
            return res;
        }

        // @cuiruoni+支持用户名或邮箱登录，WHERE条件同时匹配两个字段
        auto result = sess->sql("SELECT id, username, password_hash, salt, role, email FROM users WHERE username = ? OR email = ?")
            .bind(username).bind(username).execute();

        auto row = result.fetchOne();
        if (row.isNull()) {
            http::response<http::string_body> res{http::status::unauthorized, req.version()};
            res.body() = response::error(401, "Invalid username/email or password");
            res.prepare_payload();
            return res;
        }

        int64_t user_id = static_cast<int64_t>(row[0]);
        std::string db_username = static_cast<std::string>(row[1]);
        std::string hash_b64 = static_cast<std::string>(row[2]);
        std::string salt_b64 = static_cast<std::string>(row[3]);
        std::string role = static_cast<std::string>(row[4]);
        std::string db_email = static_cast<std::string>(row[5]);

        // @cuiruoni+密码验证：解码存储的Base64盐和哈希，用相同盐重新计算哈希后比对
        std::string salt = password::base64_decode(salt_b64);
        std::string expected_hash = password::base64_decode(hash_b64);
        std::string actual_hash = password::hash_password(password, salt);

        if (actual_hash != expected_hash) {
            http::response<http::string_body> res{http::status::unauthorized, req.version()};
            res.body() = response::error(401, "Invalid username/email or password");
            res.prepare_payload();
            return res;
        }

        // @cuiruoni+验证通过，生成JWT token，包含user_id、username、role声明
        std::string token = auth_service::generate_token(user_id, db_username, role);

        json::object data;
        data["token"] = token;
        data["user"] = json::object{
            {"id", user_id},
            {"username", db_username},
            {"email", db_email},
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

// @cuiruoni+注销处理：提取Bearer token→加入Redis黑名单，TTL与token过期时间一致
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
    // @cuiruoni+将token加入黑名单，TTL设为JWT过期时间，过期后自动从Redis清除
    auth_service::blacklist_token(token, Config::instance().jwt_expire_seconds());

    http::response<http::string_body> res{http::status::ok, req.version()};
    res.body() = response::success(std::string("Logout successful"));
    res.prepare_payload();
    return res;
}

// @cuiruoni+获取当前用户资料：需认证，返回完整用户信息（不含密码）
static http::response<http::string_body> handle_get_profile(
    const http::request<http::string_body>& req, const RouteParams& params) {
    std::string auth_field(req[http::field::authorization]);
    if (auth_field.empty() || auth_field.substr(0, 7) != "Bearer ") {
        http::response<http::string_body> res{http::status::unauthorized, req.version()};
        res.body() = response::error(401, "Authentication required");
        res.prepare_payload();
        return res;
    }

    std::string token = auth_field.substr(7);
    int64_t user_id = 0;
    std::string username, role;
    if (!auth_service::validate_token(token, user_id, username, role)) {
        http::response<http::string_body> res{http::status::unauthorized, req.version()};
        res.body() = response::error(401, "Invalid or expired token");
        res.prepare_payload();
        return res;
    }

    auto sess = MysqlPool::instance().acquire();
    if (!sess) {
        http::response<http::string_body> res{http::status::internal_server_error, req.version()};
        res.body() = response::error(500, "Database connection failed");
        res.prepare_payload();
        return res;
    }

    try {
        auto result = sess->sql(
            "SELECT id, username, email, role, bio, avatar, location, website, twitter, created_at "
            "FROM users WHERE id = ?")
            .bind(user_id).execute();
        auto row = result.fetchOne();
        if (row.isNull()) {
            http::response<http::string_body> res{http::status::not_found, req.version()};
            res.body() = response::error(404, "User not found");
            res.prepare_payload();
            return res;
        }

        json::object data;
        data["id"] = static_cast<int64_t>(row[0]);
        data["username"] = static_cast<std::string>(row[1]);
        data["email"] = row[2].isNull() ? "" : static_cast<std::string>(row[2]);
        data["role"] = static_cast<std::string>(row[3]);
        data["bio"] = row[4].isNull() ? "" : static_cast<std::string>(row[4]);
        data["avatar"] = row[5].isNull() ? "" : static_cast<std::string>(row[5]);
        data["location"] = row[6].isNull() ? "" : static_cast<std::string>(row[6]);
        data["website"] = row[7].isNull() ? "" : static_cast<std::string>(row[7]);
        data["twitter"] = row[8].isNull() ? "" : static_cast<std::string>(row[8]);
        data["created_at"] = static_cast<std::string>(row[9]);

        http::response<http::string_body> res{http::status::ok, req.version()};
        res.body() = response::success(data);
        res.prepare_payload();
        return res;
    } catch (const std::exception& e) {
        spdlog::error("Get profile error: {}", e.what());
        http::response<http::string_body> res{http::status::internal_server_error, req.version()};
        res.body() = response::error(500, "Internal server error");
        res.prepare_payload();
        return res;
    }
}

// @cuiruoni+更新用户资料：需认证，支持修改email/bio/avatar/location/website/twitter
// @cuiruoni+使用参数化查询防止SQL注入，只更新请求中提供的字段
static http::response<http::string_body> handle_update_profile(
    const http::request<http::string_body>& req, const RouteParams& params) {
    std::string auth_field(req[http::field::authorization]);
    if (auth_field.empty() || auth_field.substr(0, 7) != "Bearer ") {
        http::response<http::string_body> res{http::status::unauthorized, req.version()};
        res.body() = response::error(401, "Authentication required");
        res.prepare_payload();
        return res;
    }

    std::string token = auth_field.substr(7);
    int64_t user_id = 0;
    std::string username, role;
    if (!auth_service::validate_token(token, user_id, username, role)) {
        http::response<http::string_body> res{http::status::unauthorized, req.version()};
        res.body() = response::error(401, "Invalid or expired token");
        res.prepare_payload();
        return res;
    }

    try {
        auto body = json::parse(req.body()).as_object();

        // @cuiruoni+提取并消毒所有可选字段
        std::string email = body.contains("email") && !body["email"].is_null()
            ? sanitize::truncate(sanitize::clean_text(std::string(body["email"].as_string())), 100) : "";
        std::string bio = body.contains("bio") && !body["bio"].is_null()
            ? sanitize::truncate(sanitize::clean_text(std::string(body["bio"].as_string())), 500) : "";
        std::string avatar = body.contains("avatar") && !body["avatar"].is_null()
            ? sanitize::truncate(std::string(body["avatar"].as_string()), 500) : "";
        std::string location = body.contains("location") && !body["location"].is_null()
            ? sanitize::truncate(sanitize::clean_text(std::string(body["location"].as_string())), 100) : "";
        std::string website = body.contains("website") && !body["website"].is_null()
            ? sanitize::truncate(std::string(body["website"].as_string()), 200) : "";
        std::string twitter = body.contains("twitter") && !body["twitter"].is_null()
            ? sanitize::truncate(sanitize::clean_text(std::string(body["twitter"].as_string())), 100) : "";

        auto sess = MysqlPool::instance().acquire();
        if (!sess) {
            http::response<http::string_body> res{http::status::internal_server_error, req.version()};
            res.body() = response::error(500, "Database connection failed");
            res.prepare_payload();
            return res;
        }

        // @cuiruoni+使用参数化查询更新所有字段，防止SQL注入
        sess->sql(
            "UPDATE users SET email = ?, bio = ?, avatar = ?, location = ?, website = ?, twitter = ? "
            "WHERE id = ?")
            .bind(email)
            .bind(bio)
            .bind(avatar)
            .bind(location)
            .bind(website)
            .bind(twitter)
            .bind(user_id)
            .execute();

        // @cuiruoni+返回更新后的用户信息
        json::object data;
        data["id"] = user_id;
        data["username"] = username;
        data["email"] = email;
        data["bio"] = bio;
        data["avatar"] = avatar;
        data["location"] = location;
        data["website"] = website;
        data["twitter"] = twitter;
        data["role"] = role;

        http::response<http::string_body> res{http::status::ok, req.version()};
        res.body() = response::success("Profile updated", data);
        res.prepare_payload();
        return res;
    } catch (const std::exception& e) {
        spdlog::error("Update profile error: {}", e.what());
        http::response<http::string_body> res{http::status::internal_server_error, req.version()};
        res.body() = response::error(500, "Internal server error");
        res.prepare_payload();
        return res;
    }
}

// @cuiruoni+修改密码：需认证，验证旧密码后更新为新密码
static http::response<http::string_body> handle_change_password(
    const http::request<http::string_body>& req, const RouteParams& params) {
    // @cuiruoni+认证检查
    std::string auth_field(req[http::field::authorization]);
    if (auth_field.empty() || auth_field.substr(0, 7) != "Bearer ") {
        http::response<http::string_body> res{http::status::unauthorized, req.version()};
        res.body() = response::error(401, "Authentication required");
        res.prepare_payload();
        return res;
    }

    std::string token = auth_field.substr(7);
    int64_t user_id = 0;
    std::string username, role;
    if (!auth_service::validate_token(token, user_id, username, role)) {
        http::response<http::string_body> res{http::status::unauthorized, req.version()};
        res.body() = response::error(401, "Invalid or expired token");
        res.prepare_payload();
        return res;
    }

    try {
        auto body = json::parse(req.body()).as_object();
        if (!body.contains("old_password") || !body.contains("new_password")) {
            http::response<http::string_body> res{http::status::bad_request, req.version()};
            res.body() = response::error(400, "old_password and new_password are required");
            res.prepare_payload();
            return res;
        }

        std::string old_password = std::string(body["old_password"].as_string());
        std::string new_password = std::string(body["new_password"].as_string());

        if (new_password.size() < 6) {
            http::response<http::string_body> res{http::status::bad_request, req.version()};
            res.body() = response::error(400, "New password must be at least 6 characters");
            res.prepare_payload();
            return res;
        }

        auto sess = MysqlPool::instance().acquire();
        if (!sess) {
            http::response<http::string_body> res{http::status::internal_server_error, req.version()};
            res.body() = response::error(500, "Database connection failed");
            res.prepare_payload();
            return res;
        }

        auto result = sess->sql("SELECT password_hash, salt FROM users WHERE id = ?")
            .bind(user_id).execute();
        auto row = result.fetchOne();

        if (row.isNull()) {
            http::response<http::string_body> res{http::status::not_found, req.version()};
            res.body() = response::error(404, "User not found");
            res.prepare_payload();
            return res;
        }

        // @cuiruoni+验证旧密码
        std::string hash_b64 = static_cast<std::string>(row[0]);
        std::string salt_b64 = static_cast<std::string>(row[1]);
        std::string salt = password::base64_decode(salt_b64);
        std::string expected_hash = password::base64_decode(hash_b64);
        std::string actual_hash = password::hash_password(old_password, salt);

        if (actual_hash != expected_hash) {
            http::response<http::string_body> res{http::status::bad_request, req.version()};
            res.body() = response::error(400, "Old password is incorrect");
            res.prepare_payload();
            return res;
        }

        // @cuiruoni+生成新盐和哈希，更新密码
        std::string new_salt = password::generate_salt();
        std::string new_hash = password::hash_password(new_password, new_salt);
        std::string new_hash_b64 = password::base64_encode(new_hash);
        std::string new_salt_b64 = password::base64_encode(new_salt);

        sess->sql("UPDATE users SET password_hash = ?, salt = ?, updated_at = NOW() WHERE id = ?")
            .bind(new_hash_b64).bind(new_salt_b64).bind(user_id).execute();

        http::response<http::string_body> res{http::status::ok, req.version()};
        res.body() = response::success("Password changed successfully");
        res.prepare_payload();
        return res;
    } catch (const std::exception& e) {
        spdlog::error("Change password error: {}", e.what());
        http::response<http::string_body> res{http::status::internal_server_error, req.version()};
        res.body() = response::error(500, "Internal server error");
        res.prepare_payload();
        return res;
    }
}

// @cuiruoni+获取用户公开资料：根据username返回用户信息和其文章列表
static http::response<http::string_body> handle_get_public_profile(
    const http::request<http::string_body>& req, const RouteParams& params) {
    std::string username;
    auto it = params.path.find("username");
    if (it != params.path.end()) username = it->second;
    if (username.empty()) {
        http::response<http::string_body> res{http::status::bad_request, req.version()};
        res.body() = response::error(400, "Username is required");
        res.prepare_payload();
        return res;
    }

    auto sess = MysqlPool::instance().acquire();
    if (!sess) {
        http::response<http::string_body> res{http::status::internal_server_error, req.version()};
        res.body() = response::error(500, "Database connection failed");
        res.prepare_payload();
        return res;
    }

    try {
        // @cuiruoni+查询用户公开信息
        auto user_result = sess->sql(
            "SELECT id, username, bio, avatar, location, website, twitter, created_at "
            "FROM users WHERE username = ?")
            .bind(username).execute();
        auto user_row = user_result.fetchOne();
        if (user_row.isNull()) {
            http::response<http::string_body> res{http::status::not_found, req.version()};
            res.body() = response::error(404, "User not found");
            res.prepare_payload();
            return res;
        }

        int64_t uid = static_cast<int64_t>(user_row[0]);
        json::object profile;
        profile["id"] = uid;
        profile["username"] = static_cast<std::string>(user_row[1]);
        profile["bio"] = user_row[2].isNull() ? "" : static_cast<std::string>(user_row[2]);
        profile["avatar"] = user_row[3].isNull() ? "" : static_cast<std::string>(user_row[3]);
        profile["location"] = user_row[4].isNull() ? "" : static_cast<std::string>(user_row[4]);
        profile["website"] = user_row[5].isNull() ? "" : static_cast<std::string>(user_row[5]);
        profile["twitter"] = user_row[6].isNull() ? "" : static_cast<std::string>(user_row[6]);
        profile["created_at"] = static_cast<std::string>(user_row[7]);

        // @cuiruoni+查询该用户的文章列表
        auto posts_result = sess->sql(
            "SELECT id, title, summary, status, view_count, created_at "
            "FROM posts WHERE user_id = ? ORDER BY created_at DESC")
            .bind(uid).execute();

        json::array posts_arr;
        for (auto row = posts_result.begin(); row != posts_result.end(); ++row) {
            json::object post_obj;
            post_obj["id"] = static_cast<int64_t>((*row)[0]);
            post_obj["title"] = static_cast<std::string>((*row)[1]);
            post_obj["summary"] = (*row)[2].isNull() ? "" : static_cast<std::string>((*row)[2]);
            post_obj["status"] = static_cast<std::string>((*row)[3]);
            post_obj["view_count"] = static_cast<int64_t>((*row)[4]);
            post_obj["created_at"] = static_cast<std::string>((*row)[5]);
            post_obj["author"] = username;
            posts_arr.push_back(post_obj);
        }
        profile["posts"] = posts_arr;

        http::response<http::string_body> res{http::status::ok, req.version()};
        res.body() = response::success(profile);
        res.prepare_payload();
        return res;
    } catch (const std::exception& e) {
        spdlog::error("Get public profile error: {}", e.what());
        http::response<http::string_body> res{http::status::internal_server_error, req.version()};
        res.body() = response::error(500, "Internal server error");
        res.prepare_payload();
        return res;
    }
}

void register_auth_routes(Router& router) {
    router.add_route("POST", "/api/auth/register", handle_register);
    router.add_route("POST", "/api/auth/login", handle_login);
    router.add_route("POST", "/api/auth/logout", handle_logout);
    router.add_route("GET", "/api/users/profile", handle_get_profile);
    router.add_route("PUT", "/api/users/profile", handle_update_profile);
    router.add_route("POST", "/api/auth/change-password", handle_change_password);
    router.add_route("GET", "/api/users/:username", handle_get_public_profile);
}
