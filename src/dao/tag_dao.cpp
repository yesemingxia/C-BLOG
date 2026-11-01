#include "dao/tag_dao.h"
#include "dao/post_dao.h"
#include "db/mysql_pool.h"
#include "utils/logger.h"
#include "utils/mysqlx_helper.h"
#include "utils/sanitize.h"

namespace tag_dao {

namespace {

// @cuiruoni+A2：标签计数与标签文章列表共用的可见性条件
std::string visibility_condition(int64_t viewer_id, bool is_admin, bool& bind_viewer) {
    bind_viewer = false;
    if (is_admin) return "";
    if (viewer_id > 0) {
        bind_viewer = true;
        return " AND (p.visibility IN ('public','members') "
               "OR (p.visibility = 'private' AND p.user_id = ?))";
    }
    return " AND p.visibility = 'public'";
}

} // namespace

json::array list_with_post_count(int64_t viewer_id, bool is_admin) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return json::array{};

    bool bind_viewer = false;
    std::string visibility_sql = visibility_condition(viewer_id, is_admin, bind_viewer);

    try {
        // @cuiruoni+P0安全修复：统计只计算已发布文章，草稿不对外暴露数量
        auto stmt = sess->sql(
            "SELECT t.id, t.name, COUNT(p.id) AS post_count "
            "FROM tags t "
            "LEFT JOIN post_tags pt ON t.id = pt.tag_id "
            "LEFT JOIN posts p ON p.id = pt.post_id AND p.status = 'published'"
            + visibility_sql +
            " GROUP BY t.id, t.name ORDER BY t.name");
        if (bind_viewer) stmt.bind(viewer_id);
        auto result = stmt.execute();

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

json::array find_posts_by_tag_id(int64_t tag_id, int64_t viewer_id, bool is_admin,
                                 int page, int page_size, int& total) {
    total = 0;
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return json::array{};

    page = sanitize::clamp_page(page);
    page_size = sanitize::clamp_page_size(page_size, 10);

    bool bind_viewer = false;
    std::string visibility_sql = visibility_condition(viewer_id, is_admin, bind_viewer);

    try {
        std::string where_sql =
            " WHERE pt.tag_id = ? AND p.status = 'published'" + visibility_sql;

        // @cuiruoni+B9：先统计总数（同一套可见性谓词），再分页取数据
        auto count_stmt = sess->sql(
            "SELECT COUNT(*) FROM posts p INNER JOIN post_tags pt ON p.id = pt.post_id"
            + where_sql);
        count_stmt.bind(tag_id);
        if (bind_viewer) count_stmt.bind(viewer_id);
        auto count_result = count_stmt.execute();
        total = static_cast<int>(static_cast<int64_t>(count_result.fetchOne()[0]));

        int offset = (page - 1) * page_size;
        // @cuiruoni+P1修复：标签文章列表带作者用户名
        auto stmt = sess->sql(
            "SELECT p.id, p.title, p.summary, p.status, p.view_count, "
            "DATE_FORMAT(p.created_at, '%Y-%m-%d %H:%i:%s') AS created_at, u.username, "
            "p.cover, p.visibility, "
            "CAST(GREATEST(1, CEIL(COALESCE(CHAR_LENGTH(p.content_md), 0) / 500)) AS UNSIGNED) AS read_minutes "
            "FROM posts p INNER JOIN post_tags pt ON p.id = pt.post_id "
            "LEFT JOIN users u ON p.user_id = u.id"
            + where_sql +
            " ORDER BY p.created_at DESC, p.id DESC LIMIT ? OFFSET ?");
        stmt.bind(tag_id);
        if (bind_viewer) stmt.bind(viewer_id);
        stmt.bind(page_size).bind(offset);
        auto result = stmt.execute();

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
            obj["cover"] = mysqlx_helper::is_null(row, 7) ? "" : mysqlx_helper::to_string(row[7]);
            obj["visibility"] = mysqlx_helper::to_string(row[8]);
            obj["read_minutes"] = mysqlx_helper::to_json(row[9]);
            arr.push_back(obj);
        }
        post_dao::attach_tags(arr);
        return arr;
    } catch (const std::exception& e) {
        spdlog::error("tag_dao::find_posts_by_tag_id error: {}", e.what());
        return json::array{};
    }
}

}
