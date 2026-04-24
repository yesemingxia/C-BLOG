#include "db/redis_pool.h"
#include "utils/logger.h"

#ifdef _WIN32
#include <winsock2.h>
#endif

RedisPool& RedisPool::instance() {
    static RedisPool pool;
    return pool;
}

void RedisPool::init(const std::string& host, int port,
                     const std::string& password, int pool_size) {
    host_ = host;
    port_ = port;
    password_ = password;
    pool_size_ = pool_size;

    for (int i = 0; i < pool_size_; ++i) {
        auto ctx = create_connection();
        if (ctx) pool_.push(ctx);
    }
    spdlog::info("Redis pool initialized with {} connections", pool_.size());
}

redisContext* RedisPool::create_connection() {
    struct timeval tv{1, 0};
    redisContext* ctx = redisConnectWithTimeout(host_.c_str(), port_, tv);
    if (!ctx || ctx->err) {
        spdlog::error("Redis connect error: {}", ctx ? ctx->errstr : "null context");
        if (ctx) redisFree(ctx);
        return nullptr;
    }

    if (!password_.empty()) {
        redisReply* reply = (redisReply*)redisCommand(ctx, "AUTH %s", password_.c_str());
        if (!reply || reply->type == REDIS_REPLY_ERROR) {
            spdlog::error("Redis AUTH failed");
            freeReplyObject(reply);
            redisFree(ctx);
            return nullptr;
        }
        freeReplyObject(reply);
    }

    return ctx;
}

redisContext* RedisPool::get() {
    std::lock_guard<std::mutex> lock(mutex_);
    if (!pool_.empty()) {
        auto ctx = pool_.front();
        pool_.pop();
        return ctx;
    }
    return create_connection();
}

void RedisPool::release(redisContext* ctx) {
    if (!ctx) return;
    std::lock_guard<std::mutex> lock(mutex_);
    if (static_cast<int>(pool_.size()) < pool_size_) {
        pool_.push(ctx);
    } else {
        redisFree(ctx);
    }
}

void RedisPool::close() {
    std::lock_guard<std::mutex> lock(mutex_);
    while (!pool_.empty()) {
        redisFree(pool_.front());
        pool_.pop();
    }
    spdlog::info("Redis pool closed");
}
