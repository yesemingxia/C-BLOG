#include "dao/contact_dao.h"
#include "db/mysql_pool.h"
#include "utils/logger.h"

namespace contact_dao {

bool insert(const std::string& name, const std::string& email, const std::string& message) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return false;

    try {
        sess->sql(
            "INSERT INTO contact_messages (name, email, message) "
            "VALUES (?, ?, ?)")
            .bind(name).bind(email).bind(message).execute();
        return true;
    } catch (const std::exception& e) {
        spdlog::error("contact_dao::insert error: {}", e.what());
        return false;
    }
}

}
