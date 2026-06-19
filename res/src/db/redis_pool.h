#pragma once

#include <hiredis/hiredis.h>
#include <memory>
#include <mutex>
#include <queue>
#include <string>

// @cuiruoni+Redis连接池，基于hiredis C库，单例模式，线程安全
// @cuiruoni+使用裸指针redisContext*管理连接，调用方需配对调用release()归还
class RedisPool {
public:
    static RedisPool& instance();

    void init(const std::string& host, int port,
              const std::string& password = "", int pool_size = 4);

    redisContext* get();     // @cuiruoni+获取连接，池空时新建，调用方须release归还
    void release(redisContext* ctx); // @cuiruoni+归还连接，池满时redisFree释放

    void close();

    // @cuiruoni+连接池健康检查：验证连接是否存活，移除失效连接
    bool health_check();

    // @cuiruoni+RAII包装器，析构时自动归还连接，防止异常路径遗漏release()
    class PooledContext {
    public:
        explicit PooledContext(redisContext* ctx = nullptr);
        ~PooledContext();

        PooledContext(const PooledContext&) = delete;
        PooledContext& operator=(const PooledContext&) = delete;
        PooledContext(PooledContext&& other) noexcept;
        PooledContext& operator=(PooledContext&& other) noexcept;

        redisContext* operator->() const;
        redisContext* get() const;
        explicit operator bool() const;

    private:
        redisContext* ctx_;
    };

    PooledContext acquire();

private:
    RedisPool() = default;
    // @cuiruoni+创建新连接，含1秒超时和可选AUTH认证
    redisContext* create_connection();

    std::string host_;
    int port_ = 6379;
    std::string password_;
    int pool_size_ = 4;

    std::mutex mutex_;       // @cuiruoni+互斥锁保护pool_队列的并发访问
    std::queue<redisContext*> pool_; // @cuiruoni+空闲连接队列，裸指针需手动管理生命周期
};
