#pragma once

#include <mysqlx/xdevapi.h>
#include <memory>
#include <mutex>
#include <queue>
#include <string>

// @cuiruoni+MySQL连接池，基于MySQL X DevAPI（端口33060），单例模式，线程安全
// @cuiruoni+使用队列管理空闲连接，get()取出/release()归还，池满时释放多余连接
class MysqlPool {
public:
    static MysqlPool& instance();

    // @cuiruoni+初始化连接池，预创建pool_size个连接
    void init(const std::string& host, int port,
              const std::string& user, const std::string& password,
              const std::string& database, int pool_size = 4);

    // @cuiruoni+获取一个连接，池空时尝试新建；调用方必须配对调用release()
    std::shared_ptr<mysqlx::Session> get();
    // @cuiruoni+归还连接，池未满则回收复用，池满则关闭释放
    void release(std::shared_ptr<mysqlx::Session> session);

    void close();

    // @cuiruoni+连接池健康检查：验证连接是否存活，移除失效连接
    bool health_check();

    class PooledSession {
    public:
        explicit PooledSession(std::shared_ptr<mysqlx::Session> session = nullptr);
        ~PooledSession();

        PooledSession(const PooledSession&) = delete;
        PooledSession& operator=(const PooledSession&) = delete;
        PooledSession(PooledSession&& other) noexcept;
        PooledSession& operator=(PooledSession&& other) noexcept;

        mysqlx::Session* operator->() const;
        mysqlx::Session& operator*() const;
        explicit operator bool() const;

    private:
        std::shared_ptr<mysqlx::Session> session_;
    };

    PooledSession acquire();

private:
    MysqlPool() = default;
    std::shared_ptr<mysqlx::Session> create_session();

    std::string host_;
    int port_ = 33060;      // @cuiruoni+MySQL X DevAPI默认端口，非传统3306
    std::string user_;
    std::string password_;
    std::string database_;
    int pool_size_ = 4;

    std::mutex mutex_;       // @cuiruoni+互斥锁保护pool_队列的并发访问
    std::queue<std::shared_ptr<mysqlx::Session>> pool_; // @cuiruoni+空闲连接队列
};
