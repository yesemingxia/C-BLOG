#include "db/mysql_pool.h"
#include "utils/logger.h"

#include <utility>

MysqlPool& MysqlPool::instance() {
    // @cuiruoni+局部静态变量实现线程安全的懒汉单例（C++11保证）
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
        // @cuiruoni+优先复用池中空闲连接
        auto sess = pool_.front();
        pool_.pop();
        return sess;
    }
    // @cuiruoni+池空时新建连接，不阻塞等待，允许短暂超过pool_size_
    try {
        return create_session();
    } catch (const std::exception& e) {
        spdlog::error("MySQL get connection error: {}", e.what());
        return nullptr;
    }
}

MysqlPool::PooledSession::PooledSession(std::shared_ptr<mysqlx::Session> session)
    : session_(std::move(session)) {}

MysqlPool::PooledSession::~PooledSession() {
    if (session_) {
        MysqlPool::instance().release(session_);
    }
}

MysqlPool::PooledSession::PooledSession(PooledSession&& other) noexcept
    : session_(std::move(other.session_)) {}

MysqlPool::PooledSession& MysqlPool::PooledSession::operator=(PooledSession&& other) noexcept {
    if (this != &other) {
        if (session_) {
            MysqlPool::instance().release(session_);
        }
        session_ = std::move(other.session_);
    }
    return *this;
}

mysqlx::Session* MysqlPool::PooledSession::operator->() const {
    return session_.get();
}

mysqlx::Session& MysqlPool::PooledSession::operator*() const {
    return *session_;
}

MysqlPool::PooledSession::operator bool() const {
    return session_ != nullptr;
}

MysqlPool::PooledSession MysqlPool::acquire() {
    return PooledSession(get());
}

void MysqlPool::release(std::shared_ptr<mysqlx::Session> session) {
    if (!session) return;
    std::lock_guard<std::mutex> lock(mutex_);
    if (static_cast<int>(pool_.size()) < pool_size_) {
        // @cuiruoni+池未满，回收连接供后续复用
        pool_.push(session);
    } else {
        // @cuiruoni+池已满，直接关闭多余连接，防止连接泄漏
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

// @cuiruoni+连接池健康检查：逐个验证空闲连接，失效则移除并尝试重建
bool MysqlPool::health_check() {
    std::lock_guard<std::mutex> lock(mutex_);
    std::queue<std::shared_ptr<mysqlx::Session>> healthy;
    int checked = 0, failed = 0;

    while (!pool_.empty()) {
        auto sess = pool_.front();
        pool_.pop();
        checked++;
        try {
            sess->sql("SELECT 1").execute();
            healthy.push(sess);
        } catch (const std::exception& e) {
            failed++;
            spdlog::warn("MySQL health check: removing dead connection ({})", e.what());
            try { sess->close(); } catch (...) {}
        }
    }

    // @cuiruoni+补充失效连接到pool_size_
    int need = pool_size_ - static_cast<int>(healthy.size());
    for (int i = 0; i < need; ++i) {
        try {
            auto sess = create_session();
            if (sess) healthy.push(sess);
        } catch (const std::exception& e) {
            spdlog::warn("MySQL health check: failed to create new connection ({})", e.what());
        }
    }

    pool_ = std::move(healthy);
    spdlog::info("MySQL health check: {}/{} connections alive, {} rebuilt", checked - failed, checked, need);
    return failed == 0 || static_cast<int>(pool_.size()) >= pool_size_;
}
