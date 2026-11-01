#include "dao/contact_dao.h"
#include "dao/dao_utils.h"
#include "db/mysql_pool.h"
#include "utils/logger.h"
#include "utils/mysqlx_helper.h"
#include "utils/sanitize.h"

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

json::array list(int page, int page_size, int& total,
                 const std::string& q, const std::string& sort,
                 const std::string& order) {
    total = 0;
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return json::array{};

    try {
        page = sanitize::clamp_page(page);
        page_size = sanitize::clamp_page_size(page_size);
        const std::string pattern = "%" + sanitize::escape_like(q) + "%";
        const bool has_q = !q.empty();

        std::string where;
        if (has_q) {
            where = " WHERE (name LIKE ? ESCAPE '\\\\' "
                    "OR email LIKE ? ESCAPE '\\\\' "
                    "OR message LIKE ? ESCAPE '\\\\')";
        }

        auto count_stmt = sess->sql("SELECT COUNT(*) FROM contact_messages" + where);
        if (has_q) count_stmt.bind(pattern).bind(pattern).bind(pattern);
        auto count_result = count_stmt.execute();
        auto count_row = count_result.fetchOne();
        total = static_cast<int>(count_row[0]);

        static const std::unordered_map<std::string, std::string> sort_columns = {
            {"id", "id"},
            {"name", "name"},
            {"email", "email"},
            {"created_at", "created_at"},
        };
        std::string list_sql =
            "SELECT id, name, email, message, "
            "DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at "
            "FROM contact_messages" + where +
            dao_utils::build_order_by(sort, order, sort_columns, "created_at") +
            " LIMIT ? OFFSET ?";

        int offset = (page - 1) * page_size;
        auto list_stmt = sess->sql(list_sql);
        if (has_q) list_stmt.bind(pattern).bind(pattern).bind(pattern);
        auto result = list_stmt.bind(page_size).bind(offset).execute();

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
