#include "services/auth_service.h"

#include "utils/config.h"
#include "utils/logger.h"
#include "db/redis_pool.h"

#include <jwt-cpp/traits/boost-json/traits.h>

namespace auth_service {

// @cuiruoni+生成JWT token，包含issuer、subject(user_id)、username、role声明
// @cuiruoni+使用HS256算法签名，过期时间从配置读取
std::string generate_token(int64_t user_id, const std::string& username, const std::string& role) {
    auto token = jwt::create<jwt::traits::boost_json>()
        .set_issuer("cpp-blog")
        .set_type("JWT")
        .set_subject(std::to_string(user_id))
        .set_payload_claim("username", jwt::traits::boost_json::value_type(username))
        .set_payload_claim("role", jwt::traits::boost_json::value_type(role))
        .set_issued_at(std::chrono::system_clock::now())
        .set_expires_at(std::chrono::system_clock::now() +
                        std::chrono::seconds{Config::instance().jwt_expire_seconds()})
        .sign(jwt::algorithm::hs256{Config::instance().jwt_secret()});
    return token;
}

// @cuiruoni+验证JWT token：先检查黑名单→解码→验签→提取用户信息
// @cuiruoni+验证失败返回false（包括token过期、签名不匹配、在黑名单中）
bool validate_token(const std::string& token, int64_t& user_id, std::string& username, std::string& role) {
    try {
        if (is_token_blacklisted(token)) return false;

        auto decoded = jwt::decode<jwt::traits::boost_json>(token);
        auto verifier = jwt::verify<jwt::traits::boost_json>()
            .allow_algorithm(jwt::algorithm::hs256{Config::instance().jwt_secret()})
            .with_issuer("cpp-blog");
        verifier.verify(decoded);

        user_id = std::stoll(decoded.get_subject());
        username = decoded.get_payload_claim("username").as_string();
        role = decoded.get_payload_claim("role").as_string();
        return true;
    } catch (const std::exception& e) {
        spdlog::warn("Token validation failed: {}", e.what());
        return false;
    }
}

// @cuiruoni+检查token是否在Redis黑名单中（用户注销时加入）
bool is_token_blacklisted(const std::string& token) {
    auto ctx = RedisPool::instance().acquire();
    if (!ctx) return false;

    std::string key = "jwt_blacklist:" + token;
    redisReply* reply = (redisReply*)redisCommand(ctx.get(), "EXISTS %s", key.c_str());
    bool exists = (reply && reply->type == REDIS_REPLY_INTEGER && reply->integer == 1);
    freeReplyObject(reply);
    return exists;
}

// @cuiruoni+将token加入Redis黑名单，设置TTL等于JWT过期时间，过期自动清除
// @cuiruoni+这样即使token未过期，注销后也无法再使用
void blacklist_token(const std::string& token, int ttl_seconds) {
    auto ctx = RedisPool::instance().acquire();
    if (!ctx) return;

    std::string key = "jwt_blacklist:" + token;
    redisReply* reply = (redisReply*)redisCommand(ctx.get(), "SET %s 1 EX %d", key.c_str(), ttl_seconds);
    freeReplyObject(reply);
    spdlog::info("Token blacklisted for {} seconds", ttl_seconds);
}

// @cuiruoni+从HTTP请求Authorization头提取Bearer token并验证
bool extract_user_from_token(const http::request<http::string_body>& req,
                             int64_t& user_id, std::string& username, std::string& role) {
    std::string auth_field(req[http::field::authorization]);
    if (auth_field.empty() || auth_field.substr(0, 7) != "Bearer ") return false;
    std::string token = auth_field.substr(7);
    return validate_token(token, user_id, username, role);
}

// @cuiruoni+从HTTP请求Authorization头提取Bearer token并验证，同时检查admin角色
bool extract_admin_from_token(const http::request<http::string_body>& req,
                              int64_t& user_id, std::string& username, std::string& role) {
    if (!extract_user_from_token(req, user_id, username, role)) return false;
    return role == "admin";
}

}
