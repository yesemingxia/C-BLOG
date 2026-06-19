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
        auto result = sess->sql(
            "SELECT id, title, summary, status, view_count, created_at, "
            "MATCH(title, content_md) AGAINST(? IN NATURAL LANGUAGE MODE) AS relevance "
            "FROM posts WHERE MATCH(title, content_md) AGAINST(? IN NATURAL LANGUAGE MODE) "
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
            arr.push_back(obj);
        }
        return arr;
    } catch (const std::exception& e) {
        spdlog::error("search_dao::search error: {}", e.what());
        return json::array{};
    }
}

}
