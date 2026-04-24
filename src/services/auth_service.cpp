#include "services/auth_service.h"

#include "utils/config.h"
#include "utils/logger.h"
#include "db/redis_pool.h"

#include <jwt-cpp/traits/boost-json/traits.h>

namespace auth_service {

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

bool is_token_blacklisted(const std::string& token) {
    auto ctx = RedisPool::instance().get();
    if (!ctx) return false;

    std::string key = "jwt_blacklist:" + token;
    redisReply* reply = (redisReply*)redisCommand(ctx, "EXISTS %s", key.c_str());
    bool exists = (reply && reply->type == REDIS_REPLY_INTEGER && reply->integer == 1);
    freeReplyObject(reply);
    RedisPool::instance().release(ctx);
    return exists;
}

void blacklist_token(const std::string& token, int ttl_seconds) {
    auto ctx = RedisPool::instance().get();
    if (!ctx) return;

    std::string key = "jwt_blacklist:" + token;
    redisReply* reply = (redisReply*)redisCommand(ctx, "SET %s 1 EX %d", key.c_str(), ttl_seconds);
    freeReplyObject(reply);
    RedisPool::instance().release(ctx);
    spdlog::info("Token blacklisted for {} seconds", ttl_seconds);
}

}
