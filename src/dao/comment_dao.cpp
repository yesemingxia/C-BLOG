#include "dao/comment_dao.h"
#include "db/mysql_pool.h"
#include "utils/logger.h"
#include "utils/mysqlx_helper.h"

namespace comment_dao {

json::array list_by_post_id(int64_t post_id) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return json::array{};

    try {
        auto result = sess->sql(
            "SELECT id, post_id, author_name, author_email, content, parent_id, created_at "
            "FROM comments WHERE post_id = ? ORDER BY created_at ASC")
            .bind(post_id).execute();

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
            arr.push_back(obj);
        }
        return arr;
    } catch (const std::exception& e) {
        spdlog::error("comment_dao::list_by_post_id error: {}", e.what());
        return json::array{};
    }
}

bool insert_with_parent(int64_t post_id, const std::string& author_name,
                        const std::string& author_email, const std::string& content,
                        int64_t parent_id) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return false;

    try {
        sess->sql(
            "INSERT INTO comments (post_id, author_name, author_email, content, parent_id) "
            "VALUES (?, ?, ?, ?, ?)")
            .bind(post_id).bind(author_name).bind(author_email).bind(content).bind(parent_id)
            .execute();
        return true;
    } catch (const std::exception& e) {
        spdlog::error("comment_dao::insert_with_parent error: {}", e.what());
        return false;
    }
}

bool insert(int64_t post_id, const std::string& author_name,
            const std::string& author_email, const std::string& content) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return false;

    try {
        sess->sql(
            "INSERT INTO comments (post_id, author_name, author_email, content) "
            "VALUES (?, ?, ?, ?)")
            .bind(post_id).bind(author_name).bind(author_email).bind(content)
            .execute();
        return true;
    } catch (const std::exception& e) {
        spdlog::error("comment_dao::insert error: {}", e.what());
        return false;
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

json::array admin_list_comments(int page, int page_size, int& total) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return json::array{};

    try {
        auto count_result = sess->sql("SELECT COUNT(*) FROM comments").execute();
        total = static_cast<int>(static_cast<int64_t>(count_result.fetchOne()[0]));

        int offset = (page - 1) * page_size;
        auto result = sess->sql(
            "SELECT c.id, c.post_id, c.author_name, c.author_email, c.content, "
            "c.parent_id, c.created_at, p.title "
            "FROM comments c LEFT JOIN posts p ON c.post_id = p.id "
            "ORDER BY c.created_at DESC LIMIT ? OFFSET ?")
            .bind(page_size).bind(offset).execute();

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
