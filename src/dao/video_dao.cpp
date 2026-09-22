#include "dao/video_dao.h"
#include "db/mysql_pool.h"
#include "utils/logger.h"
#include "utils/mysqlx_helper.h"

namespace json = boost::json;

namespace video_dao {

bool insert(int64_t uploader_id, const std::string& filename,
            const std::string& original_name, int64_t& out_id) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return false;

    try {
        sess->sql(
            "INSERT INTO video_submissions (uploader_id, filename, original_name) "
            "VALUES (?, ?, ?)")
            .bind(uploader_id).bind(filename).bind(original_name).execute();
        // @cuiruoni+同连接取自增 id（连接器没有 get_auto_increment_value 便捷方法）
        auto id_result = sess->sql("SELECT LAST_INSERT_ID()").execute();
        out_id = static_cast<int64_t>(id_result.fetchOne()[0]);
        return true;
    } catch (const std::exception& e) {
        spdlog::error("video_dao::insert error: {}", e.what());
        return false;
    }
}

json::array list_by_status(const std::string& status, int page, int page_size, int& total) {
    total = 0;
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return json::array{};

    try {
        bool filtered = (status == "pending" || status == "approved" || status == "rejected");
        std::string count_sql = "SELECT COUNT(*) FROM video_submissions";
        if (filtered) count_sql += " WHERE status = ?";
        auto count_stmt = sess->sql(count_sql);
        if (filtered) count_stmt.bind(status);
        auto count_row = count_stmt.execute().fetchOne();
        total = static_cast<int>(count_row[0]);

        int offset = (page - 1) * page_size;
        std::string list_sql =
            "SELECT v.id, v.uploader_id, u.username, v.filename, v.original_name, v.status, v.is_active, "
            "DATE_FORMAT(v.created_at, '%Y-%m-%d %H:%i:%s') AS created_at "
            "FROM video_submissions v LEFT JOIN users u ON v.uploader_id = u.id";
        if (filtered) list_sql += " WHERE v.status = ?";
        list_sql += " ORDER BY v.is_active DESC, v.created_at DESC LIMIT ? OFFSET ?";

        auto stmt = sess->sql(list_sql);
        if (filtered) stmt.bind(status);
        stmt.bind(page_size).bind(offset);
        auto result = stmt.execute();

        json::array arr;
        for (auto row = result.begin(); row != result.end(); ++row) {
            json::object o;
            o["id"] = static_cast<int64_t>((*row)[0]);
            o["uploader_id"] = static_cast<int64_t>((*row)[1]);
            o["uploader_name"] = (*row)[2].isNull() ? "" : mysqlx_helper::to_string((*row)[2]);
            o["filename"] = mysqlx_helper::to_string((*row)[3]);
            o["original_name"] = (*row)[4].isNull() ? "" : mysqlx_helper::to_string((*row)[4]);
            o["status"] = mysqlx_helper::to_string((*row)[5]);
            o["is_active"] = static_cast<int64_t>((*row)[6]) != 0;
            o["created_at"] = mysqlx_helper::to_string((*row)[7]);
            o["url"] = std::string("/api/videos/file/") + mysqlx_helper::to_string((*row)[3]);
            arr.push_back(json::value(std::move(o)));
        }
        return arr;
    } catch (const std::exception& e) {
        spdlog::error("video_dao::list_by_status error: {}", e.what());
        return json::array{};
    }
}

json::object get_active() {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return json::object{};

    try {
        auto result = sess->sql(
            "SELECT id, filename, original_name, "
            "DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at "
            "FROM video_submissions WHERE is_active = 1 AND status = 'approved' LIMIT 1")
            .execute();
        auto row = result.fetchOne();
        if (row.isNull()) return json::object{};

        json::object o;
        o["id"] = static_cast<int64_t>(row[0]);
        o["url"] = std::string("/api/videos/file/") + mysqlx_helper::to_string(row[1]);
        o["original_name"] = row[2].isNull() ? "" : mysqlx_helper::to_string(row[2]);
        o["created_at"] = mysqlx_helper::to_string(row[3]);
        return o;
    } catch (const std::exception& e) {
        spdlog::error("video_dao::get_active error: {}", e.what());
        return json::object{};
    }
}

json::array list_by_uploader(int64_t uploader_id) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return json::array{};

    try {
        auto result = sess->sql(
            "SELECT id, filename, original_name, status, is_active, "
            "DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at "
            "FROM video_submissions WHERE uploader_id = ? ORDER BY created_at DESC")
            .bind(uploader_id).execute();

        json::array arr;
        for (auto row = result.begin(); row != result.end(); ++row) {
            json::object o;
            o["id"] = static_cast<int64_t>((*row)[0]);
            o["filename"] = mysqlx_helper::to_string((*row)[1]);
            o["original_name"] = (*row)[2].isNull() ? "" : mysqlx_helper::to_string((*row)[2]);
            o["status"] = mysqlx_helper::to_string((*row)[3]);
            o["is_active"] = static_cast<int64_t>((*row)[4]) != 0;
            o["created_at"] = mysqlx_helper::to_string((*row)[5]);
            o["url"] = std::string("/api/videos/file/") + mysqlx_helper::to_string((*row)[1]);
            arr.push_back(json::value(std::move(o)));
        }
        return arr;
    } catch (const std::exception& e) {
        spdlog::error("video_dao::list_by_uploader error: {}", e.what());
        return json::array{};
    }
}

bool get(int64_t id, VideoRow& out) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return false;

    try {
        auto result = sess->sql(
            "SELECT id, uploader_id, filename, original_name, status, is_active FROM video_submissions WHERE id = ?")
            .bind(id).execute();
        auto row = result.fetchOne();
        if (row.isNull()) return false;

        out.id = static_cast<int64_t>(row[0]);
        out.uploader_id = static_cast<int64_t>(row[1]);
        out.filename = mysqlx_helper::to_string(row[2]);
        out.original_name = row[3].isNull() ? "" : mysqlx_helper::to_string(row[3]);
        out.status = mysqlx_helper::to_string(row[4]);
        out.is_active = static_cast<int64_t>(row[5]) != 0;
        return true;
    } catch (const std::exception& e) {
        spdlog::error("video_dao::get error: {}", e.what());
        return false;
    }
}

bool set_status(int64_t id, const std::string& status) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return false;

    try {
        sess->sql("UPDATE video_submissions SET status = ?, reviewed_at = NOW() WHERE id = ?")
            .bind(status).bind(id).execute();
        return true;
    } catch (const std::exception& e) {
        spdlog::error("video_dao::set_status error: {}", e.what());
        return false;
    }
}

bool set_active(int64_t id) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return false;

    try {
        sess->sql("UPDATE video_submissions SET is_active = 0 WHERE is_active = 1").execute();
        sess->sql("UPDATE video_submissions SET is_active = 1 WHERE id = ?").bind(id).execute();
        return true;
    } catch (const std::exception& e) {
        spdlog::error("video_dao::set_active error: {}", e.what());
        return false;
    }
}

bool deactivate(int64_t id) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return false;

    try {
        sess->sql("UPDATE video_submissions SET is_active = 0 WHERE id = ?").bind(id).execute();
        return true;
    } catch (const std::exception& e) {
        spdlog::error("video_dao::deactivate error: {}", e.what());
        return false;
    }
}

bool delete_by_id(int64_t id) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return false;

    try {
        sess->sql("DELETE FROM video_submissions WHERE id = ?").bind(id).execute();
        return true;
    } catch (const std::exception& e) {
        spdlog::error("video_dao::delete_by_id error: {}", e.what());
        return false;
    }
}

}
