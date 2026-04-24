#pragma once

#include <hiredis/hiredis.h>
#include <memory>
#include <mutex>
#include <queue>
#include <string>

class RedisPool {
public:
    static RedisPool& instance();

    void init(const std::string& host, int port,
              const std::string& password = "", int pool_size = 4);

    redisContext* get();
    void release(redisContext* ctx);

    void close();

private:
    RedisPool() = default;
    redisContext* create_connection();

    std::string host_;
    int port_ = 6379;
    std::string password_;
    int pool_size_ = 4;

    std::mutex mutex_;
    std::queue<redisContext*> pool_;
};
