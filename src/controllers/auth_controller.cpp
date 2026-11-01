#include "controllers/auth_controller.h"

#include "dao/notification_dao.h"
#include "dao/post_dao.h"
#include "dao/user_dao.h"
#include "dao/video_dao.h"
#include "db/redis_pool.h"
#include "services/auth_service.h"
#include "services/post_service.h"
#include "services/search_service.h"
#include "utils/config.h"
#include "utils/logger.h"
#include "utils/password.h"
#include "utils/response.h"
#include "utils/sanitize.h"
#include "utils/storage.h"

#include <boost/json.hpp>
#include <jwt-cpp/traits/boost-json/traits.h>
#include <filesystem>
#include <regex>

namespace json = boost::json;
namespace http = boost::beast::http;

namespace {

bool is_valid_email(const std::string& email) {
    static std::regex email_regex(R"(^[^\s@]+@[^\s@]+\.[^\s@]+$)");
    return std::regex_match(email, email_regex);
}

// @cuiruoni+B13：删除账号后清理该用户的投稿文件（数据库行由外键级联删除）
void remove_uploaded_videos(const std::vector<std::string>& filenames) {
    std::error_code ec;
    for (const auto& name : filenames) {
        std::filesystem::remove(storage::videos() + "/" + name, ec);
        if (ec) spdlog::warn("Failed to remove video file {}: {}", name, ec.message());
        ec.clear();
    }
}

} // namespace

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
        if (!email.empty() && !is_valid_email(email)) {
            http::response<http::string_body> res{http::status::bad_request, req.version()};
            res.body() = response::error(400, "Invalid email address");
            res.prepare_payload();
            return res;
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
        // @cuiruoni+B2：邮箱唯一（空邮箱不占用名额，存 NULL）
        if (!email.empty() && user_dao::count_by_email(email) > 0) {
            http::response<http::string_body> res{http::status::conflict, req.version()};
            res.body() = response::error(409, "Email already exists");
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
        // @cuiruoni+B2：并发注册撞唯一索引时 insert 返回 0，不能继续签发 user_id=0 的 token
        if (user_id <= 0) {
            http::response<http::string_body> res{http::status::conflict, req.version()};
            res.body() = response::error(409, "Username or email already exists");
            res.prepare_payload();
            return res;
        }

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

        // @cuiruoni+安全：锁定计数用的 IP 只认 Session 归一后的 X-Client-IP。
        // @cuiruoni+客户端自带的 X-Real-IP 每请求换一个值，就等于每请求换一个新的失败桶，
        // @cuiruoni+按来源锁定会形同不存在（和 B11 那轮修掉的限流绕过是同一个口子）。
        std::string client_ip = req.find("X-Client-IP") != req.end()
            ? std::string(req["X-Client-IP"]) : std::string("unknown");

        // @cuiruoni+检查账号是否因登录失败次数过多被锁定
        if (auth_service::is_account_locked(username, client_ip)) {
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
            auth_service::record_login_failure(username, client_ip);
            http::response<http::string_body> res{http::status::unauthorized, req.version()};
            res.body() = response::error(401, "Invalid username/email or password");
            res.prepare_payload();
            return res;
        }

        // @cuiruoni+密码验证：解码存储的Base64盐和哈希，用相同盐重新计算哈希后比对（常量时间比较防时序攻击）
        std::string salt = password::base64_decode(salt_b64);
        std::string expected_hash = password::base64_decode(hash_b64);

        if (!password::verify_password(password, salt, expected_hash)) {
            auth_service::record_login_failure(db_username, client_ip);
            http::response<http::string_body> res{http::status::unauthorized, req.version()};
            res.body() = response::error(401, "Invalid username/email or password");
            res.prepare_payload();
            return res;
        }

        // @cuiruoni+登录成功，清除失败计数
        auth_service::clear_login_failures(db_username, client_ip);

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

        // @cuiruoni+B3：只记录请求中出现的字段，未出现的字段保持原值
        user_dao::ProfilePatch patch;
        auto take_string = [&](const char* key, size_t max_len, bool url_safe)
            -> std::optional<std::string> {
            auto it = body.find(key);
            if (it == body.end() || it->value().is_null()) return std::nullopt;
            if (!it->value().is_string()) throw std::invalid_argument(std::string(key) + " must be a string");
            std::string raw(it->value().as_string());
            std::string value = url_safe
                ? sanitize::safe_url(raw)
                : sanitize::truncate(sanitize::clean_text(raw), max_len);
            return value;
        };

        patch.email = take_string("email", 100, false);
        patch.bio = take_string("bio", 500, false);
        patch.avatar = take_string("avatar", 500, true);
        patch.location = take_string("location", 100, false);
        patch.website = take_string("website", 200, true);
        patch.twitter = take_string("twitter", 100, false);

        if (patch.email) {
            if (!patch.email->empty() && !is_valid_email(*patch.email)) {
                http::response<http::string_body> res{http::status::bad_request, req.version()};
                res.body() = response::error(400, "Invalid email address");
                res.prepare_payload();
                return res;
            }
            if (!patch.email->empty() &&
                user_dao::count_by_email(*patch.email, user_id) > 0) {
                http::response<http::string_body> res{http::status::conflict, req.version()};
                res.body() = response::error(409, "Email already exists");
                res.prepare_payload();
                return res;
            }
        }

        // @cuiruoni+B1 残留：换头像/清空头像后旧文件就再没人引用了，而它仍留在磁盘上、
        // @cuiruoni+仍能被 /api/upload/file/<旧名> 公开取到 —— 换个头像相当于把旧头像永久挂在网上。
        // @cuiruoni+只在「这次确实改了 avatar」时取旧值，更新成功后再判引用（同一个人可能在别处也用了这张图）。
        std::vector<std::string> old_avatar_texts;
        if (patch.avatar) {
            json::object before = user_dao::find_profile_by_id(user_id);
            auto old_it = before.find("avatar");
            if (old_it != before.end() && old_it->value().is_string()
                && old_it->value().as_string() != *patch.avatar) {
                old_avatar_texts.push_back(std::string(old_it->value().as_string()));
            }
        }

        if (!user_dao::update_profile(user_id, patch)) {
            http::response<http::string_body> res{http::status::internal_server_error, req.version()};
            res.body() = response::error(500, "Failed to update profile");
            res.prepare_payload();
            return res;
        }
        post_service::reclaim_images(old_avatar_texts);

        // @cuiruoni+B3：返回数据库里的完整资料（含粉丝/关注计数），而不是请求里的片段
        json::object data = user_dao::find_profile_by_id(user_id);
        if (data.empty()) {
            http::response<http::string_body> res{http::status::not_found, req.version()};
            res.body() = response::error(404, "User not found");
            res.prepare_payload();
            return res;
        }

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
        // @cuiruoni+原来忽略返回值：DAO 失败（连接池拿不到会话、SQL 异常）时这里照样把当前 token
        // @cuiruoni+拉黑并回「Password changed successfully」，用户被迫重新登录、且旧密码仍然有效，
        // @cuiruoni+属于「把失败说成成功」。改成失败即 500，且不做拉黑（token 保持可用）。
        if (!user_dao::update_password(user_id, new_hash_b64, new_salt_b64)) {
            spdlog::error("Change password failed at DAO layer, user_id={}", user_id);
            http::response<http::string_body> res{http::status::internal_server_error, req.version()};
            res.body() = response::error(500, "Failed to update password, please try again");
            res.prepare_payload();
            return res;
        }

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

// @cuiruoni+B13：自助注销账号。删除前必须再次验证密码；
// @cuiruoni+数据库依赖 B1 的 ON DELETE CASCADE 清理文章/评论/点赞等，磁盘上的投稿视频单独删。
static http::response<http::string_body> handle_delete_own_account(
    const http::request<http::string_body>& req, const RouteParams&) {
    std::string token = auth_service::extract_token_from_request(req);
    int64_t user_id = 0;
    std::string username, role;
    if (token.empty() || !auth_service::validate_token(token, user_id, username, role)) {
        http::response<http::string_body> res{http::status::unauthorized, req.version()};
        res.body() = response::error(401, "Invalid or expired token");
        res.prepare_payload();
        return res;
    }

    // @cuiruoni+B13：管理员账号不提供自助删除，避免误删最后一个管理员导致后台失联
    if (role == "admin") {
        http::response<http::string_body> res{http::status::bad_request, req.version()};
        res.body() = response::error(400,
            "Admin accounts cannot delete themselves; transfer ownership first");
        res.prepare_payload();
        return res;
    }

    try {
        auto body = json::parse(req.body()).as_object();
        if (!body.contains("password") || !body.at("password").is_string()) {
            http::response<http::string_body> res{http::status::bad_request, req.version()};
            res.body() = response::error(400, "Password confirmation is required");
            res.prepare_payload();
            return res;
        }
        std::string password(body.at("password").as_string());

        std::string hash_b64, salt_b64;
        if (!user_dao::find_password_by_id(user_id, hash_b64, salt_b64)) {
            http::response<http::string_body> res{http::status::not_found, req.version()};
            res.body() = response::error(404, "User not found");
            res.prepare_payload();
            return res;
        }
        std::string salt = password::base64_decode(salt_b64);
        std::string expected_hash = password::base64_decode(hash_b64);
        if (!password::verify_password(password, salt, expected_hash)) {
            http::response<http::string_body> res{http::status::bad_request, req.version()};
            res.body() = response::error(400, "Password is incorrect");
            res.prepare_payload();
            return res;
        }

        std::vector<std::string> video_files = video_dao::list_filenames_by_uploader(user_id);

        // @cuiruoni+B1 残留（图片侧）：注销同样只删数据库行，封面/正文图/头像会留在磁盘上，
        // @cuiruoni+而 /api/upload/file/:name 公开可读。先取文本，删库成功后再逐张判引用。
        std::vector<std::string> media_texts = post_dao::list_media_texts(0, user_id);
        {
            json::object profile = user_dao::find_profile_by_id(user_id);
            auto avatar_it = profile.find("avatar");
            if (avatar_it != profile.end() && avatar_it->value().is_string()) {
                media_texts.push_back(std::string(avatar_it->value().as_string()));
            }
        }

        if (!user_dao::delete_by_id(user_id)) {
            http::response<http::string_body> res{http::status::internal_server_error, req.version()};
            res.body() = response::error(500, "Failed to delete account");
            res.prepare_payload();
            return res;
        }
        remove_uploaded_videos(video_files);
        post_service::reclaim_images(media_texts);
        search_service::invalidate_cache();
        auth_service::blacklist_token(token, Config::instance().jwt_expire_seconds());

        http::response<http::string_body> res{http::status::ok, req.version()};
        {
            std::string cookie = "blog_token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax";
            if (Config::instance().get_bool("cookie_secure", false)) cookie += "; Secure";
            res.set(http::field::set_cookie, cookie);
        }
        res.body() = response::success(std::string("Account deleted"));
        res.prepare_payload();
        return res;
    } catch (const std::exception& e) {
        spdlog::error("Delete own account error: {}", e.what());
        http::response<http::string_body> res{http::status::bad_request, req.version()};
        res.body() = response::error(400, "Invalid request body");
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
        notification_dao::insert(target_id, "follow", username, "关注了你", "", 0, user_id);
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
    router.add_route("DELETE", "/api/users/me", handle_delete_own_account);
    router.add_route("GET", "/api/users/:username", handle_get_public_profile);
    router.add_route("POST", "/api/users/:username/follow", handle_follow_user);
    router.add_route("DELETE", "/api/users/:username/follow", handle_unfollow_user);
}
