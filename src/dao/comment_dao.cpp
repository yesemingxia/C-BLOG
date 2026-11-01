#include "dao/comment_dao.h"
#include "dao/dao_utils.h"
#include "db/mysql_pool.h"
#include "utils/logger.h"
#include "utils/mysqlx_helper.h"
#include "utils/sanitize.h"

namespace comment_dao {

// @cuiruoni+行 → 评论对象。list_by_post_id 与 get_by_id 共用这一份构造逻辑，
// @cuiruoni+保证「列表里的元素」与「创建后回传的对象」字段完全一致
// @cuiruoni+（两个查询的列顺序必须保持：id, post_id, author_name, content, parent_id, created_at）
// @cuiruoni+B5 隐私边界：author_email 只入库，**不进公开响应** —— 评论列表是匿名可访问的，
// @cuiruoni+回传真实邮箱等于把用户邮箱公示出去。管理员侧要看得邮箱走 /api/admin/comments。
template <typename Row>
static json::object row_to_comment(const Row& row) {
    json::object obj;
    obj["id"] = mysqlx_helper::to_json(row[0]);
    obj["post_id"] = mysqlx_helper::to_json(row[1]);
    obj["author_name"] = mysqlx_helper::to_string(row[2]);
    obj["content"] = mysqlx_helper::to_string(row[3]);
    obj["parent_id"] = mysqlx_helper::is_null(row, 4) ? json::value{} : mysqlx_helper::to_json(row[4]);
    obj["created_at"] = mysqlx_helper::to_string(row[5]);
    return obj;
}

json::array list_by_post_id(int64_t post_id, int page, int page_size, int& total) {
    total = 0;
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return json::array{};

    try {
        page = sanitize::clamp_page(page);
        page_size = sanitize::clamp_page_size(page_size, 50);

        auto count_result = sess->sql("SELECT COUNT(*) FROM comments WHERE post_id = ?")
            .bind(post_id).execute();
        total = static_cast<int>(static_cast<int64_t>(count_result.fetchOne()[0]));

        int offset = (page - 1) * page_size;
        auto result = sess->sql(
            "SELECT id, post_id, author_name, content, parent_id, "
            "DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at "
            "FROM comments WHERE post_id = ? ORDER BY created_at ASC, id ASC LIMIT ? OFFSET ?")
            .bind(post_id).bind(page_size).bind(offset).execute();

        json::array arr;
        for (auto row : result) {
            arr.push_back(row_to_comment(row));
        }
        return arr;
    } catch (const std::exception& e) {
        spdlog::error("comment_dao::list_by_post_id error: {}", e.what());
        return json::array{};
    }
}

json::object get_by_id(int64_t comment_id) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return json::object{};

    try {
        auto result = sess->sql(
            "SELECT id, post_id, author_name, content, parent_id, "
            "DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at "
            "FROM comments WHERE id = ?")
            .bind(comment_id).execute();

        // @cuiruoni+按主键查询最多一行，拿到即返回（不 break 之外还要处理空结果）
        for (auto row : result) {
            return row_to_comment(row);
        }
        return json::object{};
    } catch (const std::exception& e) {
        spdlog::error("comment_dao::get_by_id error: {}", e.what());
        return json::object{};
    }
}

int64_t insert_with_parent(int64_t post_id, const std::string& author_name,
                           const std::string& author_email, const std::string& content,
                           int64_t parent_id) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return 0;

    try {
        sess->sql(
            "INSERT INTO comments (post_id, author_name, author_email, content, parent_id) "
            "VALUES (?, ?, ?, ?, ?)")
            .bind(post_id).bind(author_name).bind(author_email).bind(content).bind(parent_id)
            .execute();

        // @cuiruoni+与 user_dao/post_dao 同一写法：在同一个session上取自增ID
        auto result = sess->sql("SELECT LAST_INSERT_ID()").execute();
        return static_cast<int64_t>(result.fetchOne()[0]);
    } catch (const std::exception& e) {
        spdlog::error("comment_dao::insert_with_parent error: {}", e.what());
        return 0;
    }
}

int64_t insert(int64_t post_id, const std::string& author_name,
               const std::string& author_email, const std::string& content) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return 0;

    try {
        sess->sql(
            "INSERT INTO comments (post_id, author_name, author_email, content) "
            "VALUES (?, ?, ?, ?)")
            .bind(post_id).bind(author_name).bind(author_email).bind(content)
            .execute();

        // @cuiruoni+与 user_dao/post_dao 同一写法：在同一个session上取自增ID
        auto result = sess->sql("SELECT LAST_INSERT_ID()").execute();
        return static_cast<int64_t>(result.fetchOne()[0]);
    } catch (const std::exception& e) {
        spdlog::error("comment_dao::insert error: {}", e.what());
        return 0;
    }
}

int64_t count_all() {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return 0;

    try {
        auto result = sess->sql("SELECT COUNT(*) FROM comments").execute();
        return static_cast<int64_t>(result.fetchOne()[0]);
    } catch (const std::exception& e) {
        spdlog::error("comment_dao::count_all error: {}", e.what());
        return 0;
    }
}

json::array admin_list_comments(int page, int page_size, int& total,
                                const std::string& q, const std::string& sort,
                                const std::string& order) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return json::array{};

    try {
        page = sanitize::clamp_page(page);
        page_size = sanitize::clamp_page_size(page_size);
        const std::string pattern = "%" + sanitize::escape_like(q) + "%";
        const bool has_q = !q.empty();

        std::string where;
        if (has_q) {
            where = " WHERE (c.content LIKE ? ESCAPE '\\\\' "
                    "OR c.author_name LIKE ? ESCAPE '\\\\' "
                    "OR p.title LIKE ? ESCAPE '\\\\')";
        }

        auto count_stmt = sess->sql(
            "SELECT COUNT(*) FROM comments c LEFT JOIN posts p ON c.post_id = p.id" + where);
        if (has_q) count_stmt.bind(pattern).bind(pattern).bind(pattern);
        auto count_result = count_stmt.execute();
        total = static_cast<int>(static_cast<int64_t>(count_result.fetchOne()[0]));

        static const std::unordered_map<std::string, std::string> sort_columns = {
            {"id", "c.id"},
            {"content", "c.content"},
            {"author_name", "c.author_name"},
            {"created_at", "c.created_at"},
            {"post_title", "p.title"},
        };
        std::string list_sql =
            "SELECT c.id, c.post_id, c.author_name, c.author_email, c.content, "
            "c.parent_id, DATE_FORMAT(c.created_at, '%Y-%m-%d %H:%i:%s') AS created_at, p.title "
            "FROM comments c LEFT JOIN posts p ON c.post_id = p.id" + where +
            dao_utils::build_order_by(sort, order, sort_columns, "created_at") +
            " LIMIT ? OFFSET ?";

        int offset = (page - 1) * page_size;
        auto list_stmt = sess->sql(list_sql);
        if (has_q) list_stmt.bind(pattern).bind(pattern).bind(pattern);
        auto result = list_stmt.bind(page_size).bind(offset).execute();

        json::array arr;
        for (auto row : result) {
            json::object obj;
            obj["id"] = mysqlx_helper::to_json(row[0]);
            obj["post_id"] = mysqlx_helper::to_json(row[1]);
            obj["author_name"] = mysqlx_helper::to_string(row[2]);
            obj["author_email"] = mysqlx_helper::is_null(row, 3) ? "" : mysqlx_helper::to_string(row[3]);
            obj["content"] = mysqlx_helper::to_string(row[4]);
            obj["parent_id"] = mysqlx_helper::is_null(row, 5) ? json::value{} : mysqlx_helper::to_json(row[5]);
            obj["created_at"] = mysqlx_helper::to_string(row[6]);
            json::object post_info;
            post_info["id"] = mysqlx_helper::to_json(row[1]);
            post_info["title"] = mysqlx_helper::is_null(row, 7) ? "" : mysqlx_helper::to_string(row[7]);
            obj["post"] = post_info;
            arr.push_back(obj);
        }
        return arr;
    } catch (const std::exception& e) {
        spdlog::error("comment_dao::admin_list_comments error: {}", e.what());
        return json::array{};
    }
}

bool exists_by_id(int64_t comment_id) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return false;

    try {
        auto check = sess->sql("SELECT id FROM comments WHERE id = ?").bind(comment_id).execute();
        return check.count() > 0;
    } catch (const std::exception& e) {
        spdlog::error("comment_dao::exists_by_id error: {}", e.what());
        return false;
    }
}

bool find_meta(int64_t comment_id, int64_t& post_id, std::string& author_name) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return false;

    try {
        auto result = sess->sql("SELECT post_id, author_name FROM comments WHERE id = ?")
            .bind(comment_id).execute();
        auto row = result.fetchOne();
        if (row.isNull()) return false;
        post_id = static_cast<int64_t>(row[0]);
        author_name = mysqlx_helper::to_string(row[1]);
        return true;
    } catch (const std::exception& e) {
        spdlog::error("comment_dao::find_meta error: {}", e.what());
        return false;
    }
}

bool delete_by_id(int64_t comment_id) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return false;

    try {
        sess->sql("DELETE FROM comments WHERE id = ?").bind(comment_id).execute();
        return true;
    } catch (const std::exception& e) {
        spdlog::error("comment_dao::delete_by_id error: {}", e.what());
        return false;
    }
}

}
