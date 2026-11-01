#include "dao/search_dao.h"
#include "dao/post_dao.h"
#include "db/mysql_pool.h"
#include "utils/logger.h"
#include "utils/mysqlx_helper.h"
#include "utils/sanitize.h"

namespace search_dao {

json::array search(const std::string& keyword, int64_t viewer_id, bool is_admin,
                   int page, int page_size, int& total) {
    total = 0;
    if (keyword.empty()) return json::array{};

    auto sess = MysqlPool::instance().acquire();
    if (!sess) return json::array{};

    page = sanitize::clamp_page(page);
    page_size = sanitize::clamp_page_size(page_size, 10);

    // @cuiruoni+A2：搜索与列表共用同一套可见性口径，避免匿名用户搜到 members/private
    std::string visibility_sql;
    bool bind_viewer = false;
    if (!is_admin) {
        if (viewer_id > 0) {
            visibility_sql =
                " AND (p.visibility IN ('public','members') "
                "OR (p.visibility = 'private' AND p.user_id = ?))";
            bind_viewer = true;
        } else {
            visibility_sql = " AND p.visibility = 'public'";
        }
    }

    try {
        std::string match_where =
            " WHERE p.status = 'published' "
            "AND MATCH(p.title, p.content_md) AGAINST(? IN NATURAL LANGUAGE MODE)"
            + visibility_sql;

        // @cuiruoni+B9：先算 total（同一套可见性谓词），再分页取结果
        auto count_stmt = sess->sql(
            "SELECT COUNT(*) FROM posts p" + match_where);
        count_stmt.bind(keyword);
        if (bind_viewer) count_stmt.bind(viewer_id);
        auto count_result = count_stmt.execute();
        total = static_cast<int>(static_cast<int64_t>(count_result.fetchOne()[0]));

        int offset = (page - 1) * page_size;
        // @cuiruoni+P1修复：搜索结果带作者用户名，前端不再显示"Unknown"
        auto stmt = sess->sql(
            "SELECT p.id, p.title, p.summary, p.status, p.view_count, "
            "DATE_FORMAT(p.created_at, '%Y-%m-%d %H:%i:%s') AS created_at, u.username, "
            "MATCH(p.title, p.content_md) AGAINST(? IN NATURAL LANGUAGE MODE) AS relevance, "
            "p.cover, p.visibility, "
            "CAST(GREATEST(1, CEIL(COALESCE(CHAR_LENGTH(p.content_md), 0) / 500)) AS UNSIGNED) AS read_minutes "
            "FROM posts p LEFT JOIN users u ON p.user_id = u.id" + match_where +
            " ORDER BY relevance DESC, p.id DESC LIMIT ? OFFSET ?");
        stmt.bind(keyword).bind(keyword);
        if (bind_viewer) stmt.bind(viewer_id);
        stmt.bind(page_size).bind(offset);
        auto result = stmt.execute();

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
            obj["cover"] = mysqlx_helper::is_null(row, 8) ? "" : mysqlx_helper::to_string(row[8]);
            obj["visibility"] = mysqlx_helper::to_string(row[9]);
            obj["read_minutes"] = mysqlx_helper::to_json(row[10]);
            arr.push_back(obj);
        }
        post_dao::attach_tags(arr);
        return arr;
    } catch (const std::exception& e) {
        spdlog::error("search_dao::search error: {}", e.what());
        return json::array{};
    }
}

}
