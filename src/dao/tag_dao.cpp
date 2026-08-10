#include "dao/tag_dao.h"
#include "db/mysql_pool.h"
#include "utils/logger.h"
#include "utils/mysqlx_helper.h"

namespace tag_dao {

json::array list_with_post_count() {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return json::array{};

    try {
        // @cuiruoni+P0安全修复：统计只计算已发布文章，草稿不对外暴露数量
        auto result = sess->sql(
            "SELECT t.id, t.name, COUNT(p.id) AS post_count "
            "FROM tags t "
            "LEFT JOIN post_tags pt ON t.id = pt.tag_id "
            "LEFT JOIN posts p ON p.id = pt.post_id AND p.status = 'published' "
            "GROUP BY t.id, t.name ORDER BY t.name")
            .execute();

        json::array arr;
        for (auto row : result) {
            json::object obj;
            obj["id"] = mysqlx_helper::to_json(row[0]);
            obj["name"] = mysqlx_helper::to_string(row[1]);
            obj["post_count"] = mysqlx_helper::to_json(row[2]);
            arr.push_back(obj);
        }
        return arr;
    } catch (const std::exception& e) {
        spdlog::error("tag_dao::list_with_post_count error: {}", e.what());
        return json::array{};
    }
}

json::array find_posts_by_tag_id(int64_t tag_id) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return json::array{};

    try {
        // @cuiruoni+P1修复：标签文章列表带作者用户名
        auto result = sess->sql(
            "SELECT p.id, p.title, p.summary, p.status, p.view_count, "
            "DATE_FORMAT(p.created_at, '%Y-%m-%d %H:%i:%s') AS created_at, u.username "
            "FROM posts p INNER JOIN post_tags pt ON p.id = pt.post_id "
            "LEFT JOIN users u ON p.user_id = u.id "
            "WHERE pt.tag_id = ? AND p.status = 'published' ORDER BY p.created_at DESC")
            .bind(tag_id).execute();

        json::array arr;
        for (auto row : result) {
            json::object obj;
            obj["id"] = mysqlx_helper::to_json(row[0]);
            obj["title"] = mysqlx_helper::to_string(row[1]);
            obj["summary"] = mysqlx_helper::is_null(row, 2) ? "" : mysqlx_helper::to_string(row[2]);
            obj["status"] = mysqlx_helper::to_string(row[3]);
            obj["view_count"] = mysqlx_helper::to_json(row[4]);
            obj["created_at"] = mysqlx_helper::to_string(row[5]);
            obj["author"] = mysqlx_helper::is_null(row, 6) ? "" : mysqlx_helper::to_string(row[6]);
            arr.push_back(obj);
        }
        return arr;
    } catch (const std::exception& e) {
        spdlog::error("tag_dao::find_posts_by_tag_id error: {}", e.what());
        return json::array{};
    }
}

}
