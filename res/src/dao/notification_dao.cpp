#include "dao/notification_dao.h"
#include "db/mysql_pool.h"
#include "utils/logger.h"
#include "utils/mysqlx_helper.h"

namespace notification_dao {

json::array list_by_user_id(int64_t user_id) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return json::array{};

    try {
        auto result = sess->sql(
            "SELECT id, type, actor_name, content, post_title, is_read, created_at "
            "FROM notifications WHERE user_id = ? ORDER BY created_at DESC")
            .bind(user_id).execute();

        json::array arr;
        for (auto row : result) {
            json::object obj;
            obj["id"] = mysqlx_helper::to_json(row[0]);
            obj["type"] = mysqlx_helper::to_string(row[1]);
            obj["actor_name"] = mysqlx_helper::is_null(row, 2) ? "" : mysqlx_helper::to_string(row[2]);
            obj["content"] = mysqlx_helper::to_string(row[3]);
            obj["post_title"] = mysqlx_helper::is_null(row, 4) ? json::value{} : mysqlx_helper::to_json(row[4]);
            obj["is_read"] = mysqlx_helper::to_json(row[5]);
            obj["created_at"] = mysqlx_helper::to_string(row[6]);
            arr.push_back(obj);
        }
        return arr;
    } catch (const std::exception& e) {
        spdlog::error("notification_dao::list_by_user_id error: {}", e.what());
        return json::array{};
    }
}

bool mark_read(int64_t notif_id, int64_t user_id) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return false;

    try {
        auto result = sess->sql("UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?")
            .bind(notif_id).bind(user_id).execute();
        return result.getAffectedItemsCount() > 0;
    } catch (const std::exception& e) {
        spdlog::error("notification_dao::mark_read error: {}", e.what());
        return false;
    }
}

bool mark_all_read(int64_t user_id) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return false;

    try {
        sess->sql("UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0")
            .bind(user_id).execute();
        return true;
    } catch (const std::exception& e) {
        spdlog::error("notification_dao::mark_all_read error: {}", e.what());
        return false;
    }
}

bool delete_by_id(int64_t notif_id, int64_t user_id) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return false;

    try {
        auto result = sess->sql("DELETE FROM notifications WHERE id = ? AND user_id = ?")
            .bind(notif_id).bind(user_id).execute();
        return result.getAffectedItemsCount() > 0;
    } catch (const std::exception& e) {
        spdlog::error("notification_dao::delete_by_id error: {}", e.what());
        return false;
    }
}

}
