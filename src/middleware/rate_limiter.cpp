#include "middleware/rate_limiter.h"
#include "db/redis_pool.h"
#include "utils/logger.h"

#include <sstream>
#include <chrono>

namespace rate_limiter {

// @cuiruoni+各端点的限流配置：窗口秒数 -> 最大请求数
static const std::unordered_map<std::string, std::pair<int, int>> limits_ = {
    {"login",    {60, 10}},    // @cuiruoni+登录：60秒内最多10次
    {"register", {60, 5}},     // @cuiruoni+注册：60秒内最多5次
    {"comment",  {60, 10}},    // @cuiruoni+评论：60秒内最多10次
    {"contact",  {60, 5}},     // @cuiruoni+联系表单：60秒内最多5次，防止垃圾消息
    {"default",  {60, 60}},    // @cuiruoni+默认：60秒内最多60次
};

bool check(const std::string& client_ip, const std::string& endpoint) {
    auto ctx = RedisPool::instance().acquire();
    if (!ctx) {
        spdlog::warn("Rate limiter: Redis unavailable, allowing request from {}", client_ip);
        return true;
    }

    auto it = limits_.find(endpoint);
    int window_seconds = it != limits_.end() ? it->second.first : 60;
    int max_requests = it != limits_.end() ? it->second.second : 60;

    std::string key = "rate_limit:" + endpoint + ":" + client_ip;

    redisReply* reply = (redisReply*)redisCommand(ctx.get(), "INCR %s", key.c_str());
    if (!reply) {
        return true;
    }
    long long count = reply->integer;
    freeReplyObject(reply);

    if (count == 1) {
        redisReply* expire_reply = (redisReply*)redisCommand(ctx.get(), "EXPIRE %s %d", key.c_str(), window_seconds);
        if (expire_reply) freeReplyObject(expire_reply);
    }

    if (count > max_requests) {
        spdlog::warn("Rate limit exceeded: {} on {} (count={}/{})", client_ip, endpoint, count, max_requests);
        return false;
    }

    return true;
}

}
