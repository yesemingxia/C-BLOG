#include "dao/notification_dao.h"
#include "db/mysql_pool.h"
#include "utils/logger.h"
#include "utils/mysqlx_helper.h"
#include "utils/sanitize.h"

namespace notification_dao {

bool insert(int64_t user_id, const std::string& type, const std::string& actor_name,
            const std::string& content, const std::string& post_title,
            int64_t post_id, int64_t actor_id) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return false;

    try {
        // @cuiruoni+B12：0 转 NULL，前端拿到 null 就不渲染跳转入口
        sess->sql(
            "INSERT INTO notifications "
            "(user_id, type, actor_name, content, post_title, post_id, actor_id) "
            "VALUES (?, ?, ?, ?, ?, NULLIF(?, 0), NULLIF(?, 0))")
            .bind(user_id).bind(type).bind(actor_name).bind(content).bind(post_title)
            .bind(post_id).bind(actor_id)
            .execute();
        return true;
    } catch (const std::exception& e) {
        spdlog::error("notification_dao::insert error: {}", e.what());
        return false;
    }
}

json::array list_by_user_id(int64_t user_id, int page, int page_size, int& total) {
    total = 0;
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return json::array{};

    try {
        page = sanitize::clamp_page(page);
        page_size = sanitize::clamp_page_size(page_size, 20);

        auto count_result = sess->sql("SELECT COUNT(*) FROM notifications WHERE user_id = ?")
            .bind(user_id).execute();
        total = static_cast<int>(static_cast<int64_t>(count_result.fetchOne()[0]));

        int offset = (page - 1) * page_size;
        auto result = sess->sql(
            "SELECT id, type, actor_name, content, post_title, is_read, "
            "DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at, post_id, actor_id "
            "FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?")
            .bind(user_id).bind(page_size).bind(offset).execute();

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
            // @cuiruoni+B12：跳转目标
            obj["post_id"] = mysqlx_helper::is_null(row, 7) ? json::value{} : mysqlx_helper::to_json(row[7]);
            obj["actor_id"] = mysqlx_helper::is_null(row, 8) ? json::value{} : mysqlx_helper::to_json(row[8]);
            arr.push_back(obj);
        }
        return arr;
    } catch (const std::exception& e) {
        spdlog::error("notification_dao::list_by_user_id error: {}", e.what());
        return json::array{};
    }
}

int64_t count_unread(int64_t user_id) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return 0;

    try {
        auto result = sess->sql(
            "SELECT COUNT(*) FROM notifications WHERE user_id = ? AND is_read = 0")
            .bind(user_id).execute();
        return static_cast<int64_t>(result.fetchOne()[0]);
    } catch (const std::exception& e) {
        spdlog::error("notification_dao::count_unread error: {}", e.what());
        return 0;
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
