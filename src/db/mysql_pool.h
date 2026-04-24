#pragma once

#include <mysqlx/xdevapi.h>
#include <memory>
#include <mutex>
#include <queue>
#include <string>

class MysqlPool {
public:
    static MysqlPool& instance();

    void init(const std::string& host, int port,
              const std::string& user, const std::string& password,
              const std::string& database, int pool_size = 4);

    std::shared_ptr<mysqlx::Session> get();
    void release(std::shared_ptr<mysqlx::Session> session);

    void close();

private:
    MysqlPool() = default;
    std::shared_ptr<mysqlx::Session> create_session();

    std::string host_;
    int port_ = 33060;
    std::string user_;
    std::string password_;
    std::string database_;
    int pool_size_ = 4;

    std::mutex mutex_;
    std::queue<std::shared_ptr<mysqlx::Session>> pool_;
};
