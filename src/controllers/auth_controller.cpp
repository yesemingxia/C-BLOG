#include "controllers/auth_controller.h"

#include "dao/notification_dao.h"
#include "dao/user_dao.h"
#include "db/redis_pool.h"
#include "services/auth_service.h"
#include "utils/config.h"
#include "utils/logger.h"
#include "utils/password.h"
#include "utils/response.h"
#include "utils/sanitize.h"

#include <boost/json.hpp>
#include <jwt-cpp/traits/boost-json/traits.h>
#include <regex>

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
        // @cuiruoni+P1修复：注册时校验邮箱格式（与联系表单一致）
        if (!email.empty()) {
            static std::regex email_regex(R"(^[^\s@]+@[^\s@]+\.[^\s@]+$)");
            if (!std::regex_match(email, email_regex)) {
                http::response<http::string_body> res{http::status::bad_request, req.version()};
                res.body() = response::error(400, "Invalid email address");
                res.prepare_payload();
                return res;
            }
        }

        // @cuiruoni+密码复杂度校验：至少6位，包含大小写字母和数字
        if (password.size() < 6) {
            http::response<http::string_body> res{http::status::bad_request, req.version()};
            res.body() = response::error(400, "Password must be at least 6 characters");
            res.prepare_payload();
            return res;
        }
        if (password.size() > 128) {
            http::response<http::string_body> res{http::status::bad_request, req.version()};
            res.body() = response::error(400, "Password must be at most 128 characters");
            res.prepare_payload();
            return res;
        }
        {
            static std::regex complexity(R"((?=.*[a-z])(?=.*[A-Z])(?=.*\d))");
            if (!std::regex_search(password, complexity)) {
                http::response<http::string_body> res{http::status::bad_request, req.version()};
                res.body() = response::error(400, "Password must contain uppercase, lowercase and digit");
                res.prepare_payload();
                return res;
            }
        }
        if (sanitize::is_common_weak_password(password)) {
            http::response<http::string_body> res{http::status::bad_request, req.version()};
            res.body() = response::error(400, "This password is too common, please choose a stronger one");
            res.prepare_payload();
            return res;
        }

        // @cuiruoni+先查询用户名是否已存在，防止唯一约束冲突
        if (user_dao::count_by_username(username) > 0) {
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

        // @cuiruoni+通过DAO层创建用户，返回新用户ID
        int64_t user_id = user_dao::insert(username, hash_b64, salt_b64, email);

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
        // @cuiruoni+P2修复：登录态写入HttpOnly Cookie，前端JS无法读取，降低XSS窃取风险
        // @cuiruoni+HTTPS 部署时配置 cookie_secure=true 追加 Secure 标志，防止明文传输
        {
            std::string cookie = "blog_token=" + token + "; HttpOnly; Path=/; Max-Age=" +
                std::to_string(Config::instance().jwt_expire_seconds()) + "; SameSite=Lax";
            if (Config::instance().get_bool("cookie_secure", false)) cookie += "; Secure";
            res.set(http::field::set_cookie, cookie);
        }
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

        // @cuiruoni+检查账号是否因登录失败次数过多被锁定
        if (auth_service::is_account_locked(username)) {
            http::response<http::string_body> res{http::status::too_many_requests, req.version()};
            res.body() = response::error(429, "Account temporarily locked due to too many failed login attempts. Please try again later.");
            res.prepare_payload();
            return res;
        }

        // @cuiruoni+支持用户名或邮箱登录，通过DAO层查询用户信息
        int64_t user_id = 0;
        std::string db_username, hash_b64, salt_b64, role, db_email;
        if (!user_dao::find_by_username_or_email(username, user_id, db_username, hash_b64, salt_b64, role, db_email)) {
            // @cuiruoni+用户不存在也记录失败，防止通过响应时间枚举用户名
            auth_service::record_login_failure(username);
            http::response<http::string_body> res{http::status::unauthorized, req.version()};
            res.body() = response::error(401, "Invalid username/email or password");
            res.prepare_payload();
            return res;
        }

        // @cuiruoni+密码验证：解码存储的Base64盐和哈希，用相同盐重新计算哈希后比对（常量时间比较防时序攻击）
        std::string salt = password::base64_decode(salt_b64);
        std::string expected_hash = password::base64_decode(hash_b64);

        if (!password::verify_password(password, salt, expected_hash)) {
            auth_service::record_login_failure(db_username);
            http::response<http::string_body> res{http::status::unauthorized, req.version()};
            res.body() = response::error(401, "Invalid username/email or password");
            res.prepare_payload();
            return res;
        }

        // @cuiruoni+登录成功，清除失败计数
        auth_service::clear_login_failures(db_username);

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
        // @cuiruoni+P2修复：登录态写入HttpOnly Cookie，前端JS无法读取，降低XSS窃取风险
        {
            std::string cookie = "blog_token=" + token + "; HttpOnly; Path=/; Max-Age=" +
                std::to_string(Config::instance().jwt_expire_seconds()) + "; SameSite=Lax";
            if (Config::instance().get_bool("cookie_secure", false)) cookie += "; Secure";
            res.set(http::field::set_cookie, cookie);
        }
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
    std::string token = auth_service::extract_token_from_request(req);
    if (token.empty()) {
        http::response<http::string_body> res{http::status::unauthorized, req.version()};
        res.body() = response::error(401, "Missing Authorization header");
        res.prepare_payload();
        return res;
    }

    // @cuiruoni+将token加入黑名单，TTL设为JWT过期时间，过期后自动从Redis清除
    auth_service::blacklist_token(token, Config::instance().jwt_expire_seconds());

    http::response<http::string_body> res{http::status::ok, req.version()};
    // @cuiruoni+P2修复：同时清除HttpOnly Cookie
    {
        std::string cookie = "blog_token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax";
        if (Config::instance().get_bool("cookie_secure", false)) cookie += "; Secure";
        res.set(http::field::set_cookie, cookie);
    }
    res.body() = response::success(std::string("Logout successful"));
    res.prepare_payload();
    return res;
}

// @cuiruoni+获取当前用户资料：需认证，返回完整用户信息（不含密码）
static http::response<http::string_body> handle_get_profile(
    const http::request<http::string_body>& req, const RouteParams& params) {
    std::string token = auth_service::extract_token_from_request(req);
    if (token.empty()) {
        // @cuiruoni+未登录时返回空数据，方便前端判断登录状态而不报错
        http::response<http::string_body> res{http::status::ok, req.version()};
        res.body() = response::success(json::value(nullptr));
        res.prepare_payload();
        return res;
    }

    int64_t user_id = 0;
    std::string username, role;
    if (!auth_service::validate_token(token, user_id, username, role)) {
        http::response<http::string_body> res{http::status::ok, req.version()};
        res.body() = response::success(json::value(nullptr));
        res.prepare_payload();
        return res;
    }

    try {
        // @cuiruoni+通过DAO层查询用户完整资料
        json::object data = user_dao::find_profile_by_id(user_id);
        if (data.empty()) {
            http::response<http::string_body> res{http::status::not_found, req.version()};
            res.body() = response::error(404, "User not found");
            res.prepare_payload();
            return res;
        }

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
    std::string token = auth_service::extract_token_from_request(req);
    if (token.empty()) {
        http::response<http::string_body> res{http::status::unauthorized, req.version()};
        res.body() = response::error(401, "Authentication required");
        res.prepare_payload();
        return res;
    }

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
            ? sanitize::safe_url(std::string(body["avatar"].as_string())) : "";
        std::string location = body.contains("location") && !body["location"].is_null()
            ? sanitize::truncate(sanitize::clean_text(std::string(body["location"].as_string())), 100) : "";
        std::string website = body.contains("website") && !body["website"].is_null()
            ? sanitize::safe_url(std::string(body["website"].as_string())) : "";
        std::string twitter = body.contains("twitter") && !body["twitter"].is_null()
            ? sanitize::truncate(sanitize::clean_text(std::string(body["twitter"].as_string())), 100) : "";

        // @cuiruoni+通过DAO层更新用户资料
        user_dao::update_profile(user_id, email, bio, avatar, location, website, twitter);

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

// @cuiruoni+获取当前用户背景设置：需认证，返回服务器留存的背景配置信息
static http::response<http::string_body> handle_get_background(
    const http::request<http::string_body>& req, const RouteParams&) {
    std::string token = auth_service::extract_token_from_request(req);
    if (token.empty()) {
        http::response<http::string_body> res{http::status::unauthorized, req.version()};
        res.body() = response::error(401, "Authentication required");
        res.prepare_payload();
        return res;
    }

    int64_t user_id = 0;
    std::string username, role;
    if (!auth_service::validate_token(token, user_id, username, role)) {
        http::response<http::string_body> res{http::status::unauthorized, req.version()};
        res.body() = response::error(401, "Invalid or expired token");
        res.prepare_payload();
        return res;
    }

    try {
        std::string background_json;
        if (!user_dao::get_background(user_id, background_json)) {
            spdlog::warn("Get background: query failed for user {}", user_id);
        }

        json::value bg = json::value(nullptr);
        if (!background_json.empty()) {
            try {
                bg = json::parse(background_json);
            } catch (...) {
                // @cuiruoni+历史脏数据按无背景处理
            }
        }

        json::object data;
        data["background"] = std::move(bg);
        http::response<http::string_body> res{http::status::ok, req.version()};
        res.body() = response::success(data);
        res.prepare_payload();
        return res;
    } catch (const std::exception& e) {
        spdlog::error("Get background error: {}", e.what());
        http::response<http::string_body> res{http::status::internal_server_error, req.version()};
        res.body() = response::error(500, "Internal server error");
        res.prepare_payload();
        return res;
    }
}

// @cuiruoni+保存当前用户背景设置：需认证，只留存配置信息（type/style_id/image_url），不含图片数据
static http::response<http::string_body> handle_update_background(
    const http::request<http::string_body>& req, const RouteParams&) {
    std::string token = auth_service::extract_token_from_request(req);
    if (token.empty()) {
        http::response<http::string_body> res{http::status::unauthorized, req.version()};
        res.body() = response::error(401, "Authentication required");
        res.prepare_payload();
        return res;
    }

    int64_t user_id = 0;
    std::string username, role;
    if (!auth_service::validate_token(token, user_id, username, role)) {
        http::response<http::string_body> res{http::status::unauthorized, req.version()};
        res.body() = response::error(401, "Invalid or expired token");
        res.prepare_payload();
        return res;
    }

    try {
        json::value v;
        try {
            v = json::parse(req.body());
        } catch (const std::exception&) {
            http::response<http::string_body> res{http::status::bad_request, req.version()};
            res.body() = response::error(400, "请求体必须是合法 JSON");
            res.prepare_payload();
            return res;
        }
        if (!v.is_object()) {
            http::response<http::string_body> res{http::status::bad_request, req.version()};
            res.body() = response::error(400, "请求体必须是 JSON 对象");
            res.prepare_payload();
            return res;
        }
        const auto& obj = v.as_object();

        // @cuiruoni+校验 type 枚举与字段长度，防脏数据入库
        std::string type = obj.contains("type") && obj.at("type").is_string()
            ? std::string(obj.at("type").as_string()) : "none";
        if (type != "none" && type != "image" && type != "style") {
            http::response<http::string_body> res{http::status::bad_request, req.version()};
            res.body() = response::error(400, "非法 background type");
            res.prepare_payload();
            return res;
        }

        std::string style_id = obj.contains("style_id") && obj.at("style_id").is_string()
            ? std::string(obj.at("style_id").as_string()) : "";
        std::string image_url = obj.contains("image_url") && obj.at("image_url").is_string()
            ? std::string(obj.at("image_url").as_string()) : "";
        style_id = sanitize::truncate(style_id, 50);
        image_url = sanitize::truncate(image_url, 300);

        // @cuiruoni+重新序列化，丢弃未知字段，保证存储结构可控
        json::object bg;
        bg["type"] = type;
        bg["style_id"] = style_id;
        bg["image_url"] = image_url;
        std::string bg_str = json::serialize(json::value(std::move(bg)));

        if (!user_dao::update_background(user_id, bg_str)) {
            http::response<http::string_body> res{http::status::internal_server_error, req.version()};
            res.body() = response::error(500, "保存失败");
            res.prepare_payload();
            return res;
        }

        http::response<http::string_body> res{http::status::ok, req.version()};
        res.body() = response::success("Background saved", json::parse(bg_str));
        res.prepare_payload();
        return res;
    } catch (const std::exception& e) {
        spdlog::error("Update background error: {}", e.what());
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
    std::string token = auth_service::extract_token_from_request(req);
    if (token.empty()) {
        http::response<http::string_body> res{http::status::unauthorized, req.version()};
        res.body() = response::error(401, "Authentication required");
        res.prepare_payload();
        return res;
    }

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
        if (new_password.size() > 128) {
            http::response<http::string_body> res{http::status::bad_request, req.version()};
            res.body() = response::error(400, "New password must be at most 128 characters");
            res.prepare_payload();
            return res;
        }
        {
            static std::regex complexity(R"((?=.*[a-z])(?=.*[A-Z])(?=.*\d))");
            if (!std::regex_search(new_password, complexity)) {
                http::response<http::string_body> res{http::status::bad_request, req.version()};
                res.body() = response::error(400, "New password must contain uppercase, lowercase and digit");
                res.prepare_payload();
                return res;
            }
        }
        if (sanitize::is_common_weak_password(new_password)) {
            http::response<http::string_body> res{http::status::bad_request, req.version()};
            res.body() = response::error(400, "This password is too common, please choose a stronger one");
            res.prepare_payload();
            return res;
        }

        // @cuiruoni+通过DAO层查询用户密码哈希和盐
        std::string hash_b64, salt_b64;
        if (!user_dao::find_password_by_id(user_id, hash_b64, salt_b64)) {
            http::response<http::string_body> res{http::status::not_found, req.version()};
            res.body() = response::error(404, "User not found");
            res.prepare_payload();
            return res;
        }

        // @cuiruoni+验证旧密码（常量时间比较防时序攻击）
        std::string salt = password::base64_decode(salt_b64);
        std::string expected_hash = password::base64_decode(hash_b64);

        if (!password::verify_password(old_password, salt, expected_hash)) {
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

        // @cuiruoni+通过DAO层更新密码
        user_dao::update_password(user_id, new_hash_b64, new_salt_b64);

        // @cuiruoni+P1修复：改密后把当前token加入黑名单，旧token立即失效
        auth_service::blacklist_token(token, Config::instance().jwt_expire_seconds());

        http::response<http::string_body> res{http::status::ok, req.version()};
        res.body() = response::success(std::string("Password changed successfully"));
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

    try {
        // @cuiruoni+通过DAO层查询用户公开资料及文章列表
        json::object profile = user_dao::find_public_profile_by_username(username);
        if (profile.empty()) {
            http::response<http::string_body> res{http::status::not_found, req.version()};
            res.body() = response::error(404, "User not found");
            res.prepare_payload();
            return res;
        }

        // @cuiruoni+P1修复：公开资料附带"当前用户是否已关注"
        int64_t viewer_id = 0;
        std::string viewer_name, viewer_role;
        bool authed = auth_service::extract_user_from_token(req, viewer_id, viewer_name, viewer_role);
        int64_t target_id = profile.contains("id") ? profile["id"].as_int64() : 0;
        profile["is_following"] = authed && target_id != viewer_id
            ? user_dao::is_following(viewer_id, target_id) : false;

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

// @cuiruoni+关注用户：成功后通知对方（P1修复）
static http::response<http::string_body> handle_follow_user(
    const http::request<http::string_body>& req, const RouteParams& params) {
    int64_t user_id = 0;
    std::string username, role;
    if (!auth_service::extract_user_from_token(req, user_id, username, role)) {
        http::response<http::string_body> res{http::status::unauthorized, req.version()};
        res.body() = response::error(401, "Authentication required");
        res.prepare_payload();
        return res;
    }

    auto it = params.path.find("username");
    if (it == params.path.end() || it->second.empty()) {
        http::response<http::string_body> res{http::status::bad_request, req.version()};
        res.body() = response::error(400, "Username is required");
        res.prepare_payload();
        return res;
    }

    int64_t target_id = user_dao::find_id_by_username(it->second);
    if (target_id == 0) {
        http::response<http::string_body> res{http::status::not_found, req.version()};
        res.body() = response::error(404, "User not found");
        res.prepare_payload();
        return res;
    }
    if (target_id == user_id) {
        http::response<http::string_body> res{http::status::bad_request, req.version()};
        res.body() = response::error(400, "Cannot follow yourself");
        res.prepare_payload();
        return res;
    }

    bool newly_followed = user_dao::follow(user_id, target_id);
    if (newly_followed) {
        notification_dao::insert(target_id, "follow", username, "关注了你", "");
    }

    json::object data;
    data["is_following"] = true;
    data["follower_count"] = user_dao::count_followers(target_id);
    http::response<http::string_body> res{http::status::ok, req.version()};
    res.body() = response::success("Followed", data);
    res.prepare_payload();
    return res;
}

// @cuiruoni+取消关注
static http::response<http::string_body> handle_unfollow_user(
    const http::request<http::string_body>& req, const RouteParams& params) {
    int64_t user_id = 0;
    std::string username, role;
    if (!auth_service::extract_user_from_token(req, user_id, username, role)) {
        http::response<http::string_body> res{http::status::unauthorized, req.version()};
        res.body() = response::error(401, "Authentication required");
        res.prepare_payload();
        return res;
    }

    auto it = params.path.find("username");
    if (it == params.path.end() || it->second.empty()) {
        http::response<http::string_body> res{http::status::bad_request, req.version()};
        res.body() = response::error(400, "Username is required");
        res.prepare_payload();
        return res;
    }

    int64_t target_id = user_dao::find_id_by_username(it->second);
    if (target_id == 0) {
        http::response<http::string_body> res{http::status::not_found, req.version()};
        res.body() = response::error(404, "User not found");
        res.prepare_payload();
        return res;
    }

    user_dao::unfollow(user_id, target_id);

    json::object data;
    data["is_following"] = false;
    data["follower_count"] = user_dao::count_followers(target_id);
    http::response<http::string_body> res{http::status::ok, req.version()};
    res.body() = response::success("Unfollowed", data);
    res.prepare_payload();
    return res;
}

void register_auth_routes(Router& router) {
    router.add_route("POST", "/api/auth/register", handle_register);
    router.add_route("POST", "/api/auth/login", handle_login);
    router.add_route("POST", "/api/auth/logout", handle_logout);
    router.add_route("GET", "/api/users/profile", handle_get_profile);
    router.add_route("PUT", "/api/users/profile", handle_update_profile);
    router.add_route("GET", "/api/users/background", handle_get_background);
    router.add_route("PUT", "/api/users/background", handle_update_background);
    router.add_route("POST", "/api/auth/change-password", handle_change_password);
    router.add_route("GET", "/api/users/:username", handle_get_public_profile);
    router.add_route("POST", "/api/users/:username/follow", handle_follow_user);
    router.add_route("DELETE", "/api/users/:username/follow", handle_unfollow_user);
}
