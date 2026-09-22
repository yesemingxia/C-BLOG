#include "dao/contact_dao.h"
#include "db/mysql_pool.h"
#include "utils/logger.h"
#include "utils/mysqlx_helper.h"

namespace json = boost::json;

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

json::array list(int page, int page_size, int& total) {
    total = 0;
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return json::array{};

    try {
        auto count_result = sess->sql("SELECT COUNT(*) FROM contact_messages").execute();
        auto count_row = count_result.fetchOne();
        total = static_cast<int>(count_row[0]);

        int offset = (page - 1) * page_size;
        auto result = sess->sql(
            "SELECT id, name, email, message, "
            "DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at "
            "FROM contact_messages ORDER BY created_at DESC LIMIT ? OFFSET ?")
            .bind(page_size).bind(offset).execute();

        json::array arr;
        for (auto row = result.begin(); row != result.end(); ++row) {
            json::object o;
            o["id"] = static_cast<int64_t>((*row)[0]);
            o["name"] = (*row)[1].isNull() ? "" : mysqlx_helper::to_string((*row)[1]);
            o["email"] = (*row)[2].isNull() ? "" : mysqlx_helper::to_string((*row)[2]);
            o["message"] = (*row)[3].isNull() ? "" : mysqlx_helper::to_string((*row)[3]);
            o["created_at"] = mysqlx_helper::to_string((*row)[4]);
            arr.push_back(json::value(std::move(o)));
        }
        return arr;
    } catch (const std::exception& e) {
        spdlog::error("contact_dao::list error: {}", e.what());
        return json::array{};
    }
}

bool exists_by_id(int64_t id) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return false;

    try {
        auto result = sess->sql("SELECT 1 FROM contact_messages WHERE id = ?").bind(id).execute();
        auto row = result.fetchOne();
        return !row.isNull();
    } catch (const std::exception& e) {
        spdlog::error("contact_dao::exists_by_id error: {}", e.what());
        return false;
    }
}

bool delete_by_id(int64_t id) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return false;

    try {
        sess->sql("DELETE FROM contact_messages WHERE id = ?").bind(id).execute();
        return true;
    } catch (const std::exception& e) {
        spdlog::error("contact_dao::delete_by_id error: {}", e.what());
        return false;
    }
}

}
