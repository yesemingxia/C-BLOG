#include "db/mysql_pool.h"
#include "utils/logger.h"

MysqlPool& MysqlPool::instance() {
    static MysqlPool pool;
    return pool;
}

void MysqlPool::init(const std::string& host, int port,
                     const std::string& user, const std::string& password,
                     const std::string& database, int pool_size) {
    host_ = host;
    port_ = port;
    user_ = user;
    password_ = password;
    database_ = database;
    pool_size_ = pool_size;

    for (int i = 0; i < pool_size_; ++i) {
        try {
            auto sess = create_session();
            if (sess) pool_.push(sess);
        } catch (const std::exception& e) {
            spdlog::error("MySQL pool init error on connection {}: {}", i, e.what());
        }
    }
    spdlog::info("MySQL pool initialized with {} connections", pool_.size());
}

std::shared_ptr<mysqlx::Session> MysqlPool::create_session() {
    mysqlx::SessionSettings settings(
        host_, static_cast<unsigned>(port_),
        user_, password_, database_
    );
    auto sess = std::make_shared<mysqlx::Session>(settings);
    return sess;
}

std::shared_ptr<mysqlx::Session> MysqlPool::get() {
    std::lock_guard<std::mutex> lock(mutex_);
    if (!pool_.empty()) {
        auto sess = pool_.front();
        pool_.pop();
        return sess;
    }
    try {
        return create_session();
    } catch (const std::exception& e) {
        spdlog::error("MySQL get connection error: {}", e.what());
        return nullptr;
    }
}

void MysqlPool::release(std::shared_ptr<mysqlx::Session> session) {
    if (!session) return;
    std::lock_guard<std::mutex> lock(mutex_);
    if (static_cast<int>(pool_.size()) < pool_size_) {
        pool_.push(session);
    } else {
        session->close();
    }
}

void MysqlPool::close() {
    std::lock_guard<std::mutex> lock(mutex_);
    while (!pool_.empty()) {
        try {
            pool_.front()->close();
        } catch (...) {}
        pool_.pop();
    }
    spdlog::info("MySQL pool closed");
}
