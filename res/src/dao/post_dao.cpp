#include "dao/post_dao.h"
#include "db/mysql_pool.h"
#include "utils/logger.h"
#include "utils/mysqlx_helper.h"

#include <unordered_set>

namespace post_dao {

json::array list_posts(int page, int page_size, const std::string& status, int& total) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return json::array{};

    std::string count_sql = "SELECT COUNT(*) FROM posts";
    std::string list_sql = "SELECT id, title, summary, user_id, status, view_count, created_at, updated_at FROM posts";
    if (status != "all") {
        count_sql += " WHERE status = ?";
        list_sql += " WHERE status = ?";
    }
    list_sql += " ORDER BY created_at DESC LIMIT ? OFFSET ?";

    try {
        auto count_result = status != "all"
            ? sess->sql(count_sql).bind(status).execute()
            : sess->sql(count_sql).execute();
        auto count_row = count_result.fetchOne();
        total = static_cast<int>(count_row[0]);

        int offset = (page - 1) * page_size;
        auto result = status != "all"
            ? sess->sql(list_sql).bind(status).bind(page_size).bind(offset).execute()
            : sess->sql(list_sql).bind(page_size).bind(offset).execute();

        json::array arr;
        for (auto row : result) {
            json::object obj;
            obj["id"] = mysqlx_helper::to_json(row[0]);
            obj["title"] = mysqlx_helper::to_string(row[1]);
            obj["summary"] = mysqlx_helper::is_null(row, 2) ? "" : mysqlx_helper::to_string(row[2]);
            obj["user_id"] = mysqlx_helper::to_json(row[3]);
            obj["status"] = mysqlx_helper::to_string(row[4]);
            obj["view_count"] = mysqlx_helper::to_json(row[5]);
            obj["created_at"] = mysqlx_helper::to_string(row[6]);
            obj["updated_at"] = mysqlx_helper::to_string(row[7]);
            arr.push_back(obj);
        }
        return arr;
    } catch (const std::exception& e) {
        spdlog::error("post_dao::list_posts error: {}", e.what());
        return json::array{};
    }
}

Post find_by_id(int64_t id) {
    auto sess = MysqlPool::instance().acquire();
    Post p;
    if (!sess) return p;

    try {
        auto result = sess->sql(
            "SELECT id, title, content_md, content_html, summary, user_id, status, view_count, created_at, updated_at "
            "FROM posts WHERE id = ?")
            .bind(id).execute();

        auto row = result.fetchOne();
        if (row.isNull()) return p;

        p.id = static_cast<int64_t>(row[0]);
        p.title = static_cast<std::string>(row[1]);
        p.content_md = static_cast<std::string>(row[2]);
        p.content_html = static_cast<std::string>(row[3]);
        p.summary = row[4].isNull() ? "" : static_cast<std::string>(row[4]);
        p.user_id = static_cast<int64_t>(row[5]);
        p.status = static_cast<std::string>(row[6]);
        p.view_count = static_cast<int>(static_cast<uint64_t>(row[7]));
        p.created_at = static_cast<std::string>(row[8]);
        p.updated_at = static_cast<std::string>(row[9]);

        p.tags = load_tags(id);
    } catch (const std::exception& e) {
        spdlog::error("post_dao::find_by_id error: {}", e.what());
    }
    return p;
}

bool increment_view_count(int64_t id) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return false;

    try {
        sess->sql("UPDATE posts SET view_count = view_count + 1 WHERE id = ?")
            .bind(id).execute();
        return true;
    } catch (const std::exception& e) {
        spdlog::error("post_dao::increment_view_count error: {}", e.what());
        return false;
    }
}

int64_t insert(const Post& post, const std::string& content_html, const std::string& summary) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return 0;

    try {
        sess->sql(
            "INSERT INTO posts (title, content_md, content_html, summary, user_id, status) "
            "VALUES (?, ?, ?, ?, ?, ?)")
            .bind(post.title)
            .bind(post.content_md)
            .bind(content_html)
            .bind(summary)
            .bind(post.user_id)
            .bind(post.status.empty() ? std::string("draft") : post.status)
            .execute();

        auto result = sess->sql("SELECT LAST_INSERT_ID()").execute();
        int64_t id = static_cast<int64_t>(result.fetchOne()[0]);
        return id;
    } catch (const std::exception& e) {
        spdlog::error("post_dao::insert error: {}", e.what());
        return 0;
    }
}

bool update(int64_t id, const Post& post, const std::string& content_html) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return false;

    try {
        sess->sql(
            "UPDATE posts SET title = ?, content_md = ?, content_html = ?, "
            "summary = ?, status = ? WHERE id = ?")
            .bind(post.title)
            .bind(post.content_md)
            .bind(content_html)
            .bind(post.summary)
            .bind(post.status)
            .bind(id)
            .execute();
        return true;
    } catch (const std::exception& e) {
        spdlog::error("post_dao::update error: {}", e.what());
        return false;
    }
}

bool delete_by_id(int64_t id) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return false;

    try {
        sess->startTransaction();
        sess->sql("DELETE FROM comments WHERE post_id = ?").bind(id).execute();
        sess->sql("DELETE FROM post_tags WHERE post_id = ?").bind(id).execute();
        sess->sql("DELETE FROM posts WHERE id = ?").bind(id).execute();
        sess->commit();
        return true;
    } catch (const std::exception& e) {
        try {
            sess->rollback();
        } catch (const std::exception& rollback_error) {
            spdlog::error("post_dao::delete_by_id rollback error: {}", rollback_error.what());
        }
        spdlog::error("post_dao::delete_by_id error: {}", e.what());
        return false;
    }
}

int64_t find_user_id(int64_t post_id) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return 0;

    try {
        auto result = sess->sql("SELECT user_id FROM posts WHERE id = ?")
            .bind(post_id).execute();
        auto row = result.fetchOne();
        if (row.isNull()) return 0;
        return static_cast<int64_t>(row[0]);
    } catch (const std::exception& e) {
        spdlog::error("post_dao::find_user_id error: {}", e.what());
        return 0;
    }
}

std::vector<std::string> load_tags(int64_t post_id) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return {};

    try {
        std::vector<std::string> tags;
        auto result = sess->sql(
            "SELECT t.name FROM tags t "
            "JOIN post_tags pt ON pt.tag_id = t.id "
            "WHERE pt.post_id = ? ORDER BY t.name")
            .bind(post_id).execute();

        for (auto row : result) {
            tags.push_back(mysqlx_helper::to_string(row[0]));
        }
        return tags;
    } catch (const std::exception& e) {
        spdlog::error("post_dao::load_tags error: {}", e.what());
        return {};
    }
}

void sync_tags(int64_t post_id, const std::vector<std::string>& tags) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return;

    try {
        sess->sql("DELETE FROM post_tags WHERE post_id = ?").bind(post_id).execute();

        std::unordered_set<std::string> seen;
        for (const auto& raw_name : tags) {
            std::string name = raw_name.substr(0, 50);
            if (name.empty() || !seen.insert(name).second) continue;

            sess->sql("INSERT IGNORE INTO tags (name) VALUES (?)").bind(name).execute();
            auto result = sess->sql("SELECT id FROM tags WHERE name = ?").bind(name).execute();
            auto row = result.fetchOne();
            if (row.isNull()) continue;

            sess->sql("INSERT IGNORE INTO post_tags (post_id, tag_id) VALUES (?, ?)")
                .bind(post_id)
                .bind(static_cast<int64_t>(row[0]))
                .execute();
        }
    } catch (const std::exception& e) {
        spdlog::error("post_dao::sync_tags error: {}", e.what());
    }
}

json::array admin_list_posts(int page, int page_size, const std::string& status, int& total) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return json::array{};

    try {
        std::string count_sql = "SELECT COUNT(*) FROM posts";
        std::string list_sql =
            "SELECT p.id, p.title, p.status, p.view_count, p.created_at, p.updated_at, "
            "u.id, u.username "
            "FROM posts p LEFT JOIN users u ON p.user_id = u.id";

        if (status != "all") {
            count_sql += " WHERE status = ?";
            list_sql += " WHERE p.status = ? ORDER BY p.created_at DESC LIMIT ? OFFSET ?";
        } else {
            list_sql += " ORDER BY p.created_at DESC LIMIT ? OFFSET ?";
        }

        if (status != "all") {
            auto count_result = sess->sql(count_sql).bind(status).execute();
            total = static_cast<int>(static_cast<int64_t>(count_result.fetchOne()[0]));
        } else {
            auto count_result = sess->sql(count_sql).execute();
            total = static_cast<int>(static_cast<int64_t>(count_result.fetchOne()[0]));
        }

        int offset = (page - 1) * page_size;

        mysqlx::SqlResult result;
        if (status != "all") {
            result = sess->sql(list_sql).bind(status).bind(page_size).bind(offset).execute();
        } else {
            result = sess->sql(list_sql).bind(page_size).bind(offset).execute();
        }

        json::array arr;
        for (auto row : result) {
            json::object obj;
            obj["id"] = mysqlx_helper::to_json(row[0]);
            obj["title"] = mysqlx_helper::to_string(row[1]);
            obj["status"] = mysqlx_helper::to_string(row[2]);
            obj["view_count"] = mysqlx_helper::to_json(row[3]);
            obj["created_at"] = mysqlx_helper::to_string(row[4]);
            obj["updated_at"] = mysqlx_helper::is_null(row, 5) ? "" : mysqlx_helper::to_string(row[5]);
            json::object author;
            author["id"] = mysqlx_helper::to_json(row[6]);
            author["username"] = mysqlx_helper::to_string(row[7]);
            obj["author"] = author;
            arr.push_back(obj);
        }
        return arr;
    } catch (const std::exception& e) {
        spdlog::error("post_dao::admin_list_posts error: {}", e.what());
        return json::array{};
    }
}

bool exists_by_id(int64_t post_id) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return false;

    try {
        auto check = sess->sql("SELECT id FROM posts WHERE id = ?").bind(post_id).execute();
        return check.count() > 0;
    } catch (const std::exception& e) {
        spdlog::error("post_dao::exists_by_id error: {}", e.what());
        return false;
    }
}

int64_t count_all() {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return 0;

    try {
        auto result = sess->sql("SELECT COUNT(*) FROM posts").execute();
        return static_cast<int64_t>(result.fetchOne()[0]);
    } catch (const std::exception& e) {
        spdlog::error("post_dao::count_all error: {}", e.what());
        return 0;
    }
}

int64_t count_by_status(const std::string& status) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return 0;

    try {
        auto result = sess->sql("SELECT COUNT(*) FROM posts WHERE status = ?").bind(status).execute();
        return static_cast<int64_t>(result.fetchOne()[0]);
    } catch (const std::exception& e) {
        spdlog::error("post_dao::count_by_status error: {}", e.what());
        return 0;
    }
}

}
