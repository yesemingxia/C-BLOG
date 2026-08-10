#include "dao/search_dao.h"
#include "db/mysql_pool.h"
#include "utils/logger.h"
#include "utils/mysqlx_helper.h"

namespace search_dao {

json::array search(const std::string& keyword) {
    if (keyword.empty()) return json::array{};

    auto sess = MysqlPool::instance().acquire();
    if (!sess) return json::array{};

    try {
        // @cuiruoni+P1修复：搜索结果带作者用户名，前端不再显示"Unknown"
        auto result = sess->sql(
            "SELECT p.id, p.title, p.summary, p.status, p.view_count, "
            "DATE_FORMAT(p.created_at, '%Y-%m-%d %H:%i:%s') AS created_at, u.username, "
            "MATCH(p.title, p.content_md) AGAINST(? IN NATURAL LANGUAGE MODE) AS relevance "
            "FROM posts p LEFT JOIN users u ON p.user_id = u.id "
            "WHERE p.status = 'published' AND MATCH(p.title, p.content_md) AGAINST(? IN NATURAL LANGUAGE MODE) "
            "ORDER BY relevance DESC LIMIT 20")
            .bind(keyword).bind(keyword).execute();

        json::array arr;
        for (auto row : result) {
            json::object obj;
            obj["id"] = mysqlx_helper::to_json(row[0]);
            obj["title"] = mysqlx_helper::to_string(row[1]);
            obj["summary"] = row[2].isNull() ? "" : mysqlx_helper::to_string(row[2]);
            obj["status"] = mysqlx_helper::to_string(row[3]);
            obj["view_count"] = mysqlx_helper::to_json(row[4]);
            obj["created_at"] = mysqlx_helper::to_string(row[5]);
            obj["author"] = mysqlx_helper::is_null(row, 6) ? "" : mysqlx_helper::to_string(row[6]);
            arr.push_back(obj);
        }
        return arr;
    } catch (const std::exception& e) {
        spdlog::error("search_dao::search error: {}", e.what());
        return json::array{};
    }
}

}
