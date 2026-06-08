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
    // @cuiruoni+设置1秒连接超时，避免阻塞
    struct timeval tv{1, 0};
    redisContext* ctx = redisConnectWithTimeout(host_.c_str(), port_, tv);
    if (!ctx || ctx->err) {
        spdlog::error("Redis connect error: {}", ctx ? ctx->errstr : "null context");
        if (ctx) redisFree(ctx);
        return nullptr;
    }

    // @cuiruoni+如果配置了密码，执行AUTH命令认证
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
        // @cuiruoni+池未满，回收连接供后续复用
        pool_.push(ctx);
    } else {
        // @cuiruoni+池已满，释放多余连接，防止连接泄漏
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

// @cuiruoni+连接池健康检查：PING验证每个连接，失效则移除并尝试重建
bool RedisPool::health_check() {
    std::lock_guard<std::mutex> lock(mutex_);
    std::queue<redisContext*> healthy;
    int checked = 0, failed = 0;

    while (!pool_.empty()) {
        auto ctx = pool_.front();
        pool_.pop();
        checked++;
        redisReply* reply = (redisReply*)redisCommand(ctx, "PING");
        if (reply && reply->type == REDIS_REPLY_STATUS && reply->str && std::string(reply->str) == "PONG") {
            healthy.push(ctx);
        } else {
            failed++;
            spdlog::warn("Redis health check: removing dead connection");
            redisFree(ctx);
        }
        if (reply) freeReplyObject(reply);
    }

    // @cuiruoni+补充失效连接到pool_size_
    int need = pool_size_ - static_cast<int>(healthy.size());
    for (int i = 0; i < need; ++i) {
        auto ctx = create_connection();
        if (ctx) healthy.push(ctx);
    }

    pool_ = std::move(healthy);
    spdlog::info("Redis health check: {}/{} connections alive, {} rebuilt", checked - failed, checked, need);
    return failed == 0 || static_cast<int>(pool_.size()) >= pool_size_;
}

// @cuiruoni+PooledContext RAII实现：构造时获取连接，析构时自动归还
RedisPool::PooledContext::PooledContext(redisContext* ctx) : ctx_(ctx) {}

RedisPool::PooledContext::~PooledContext() {
    if (ctx_) {
        RedisPool::instance().release(ctx_);
    }
}

RedisPool::PooledContext::PooledContext(PooledContext&& other) noexcept
    : ctx_(other.ctx_) {
    other.ctx_ = nullptr;
}

RedisPool::PooledContext& RedisPool::PooledContext::operator=(PooledContext&& other) noexcept {
    if (this != &other) {
        if (ctx_) {
            RedisPool::instance().release(ctx_);
        }
        ctx_ = other.ctx_;
        other.ctx_ = nullptr;
    }
    return *this;
}

redisContext* RedisPool::PooledContext::operator->() const {
    return ctx_;
}

redisContext* RedisPool::PooledContext::get() const {
    return ctx_;
}

RedisPool::PooledContext::operator bool() const {
    return ctx_ != nullptr;
}

RedisPool::PooledContext RedisPool::acquire() {
    return PooledContext(get());
}
