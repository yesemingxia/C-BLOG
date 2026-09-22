#include "dao/post_dao.h"
#include "db/mysql_pool.h"
#include "utils/logger.h"
#include "utils/mysqlx_helper.h"

#include <unordered_set>

namespace post_dao {

json::array list_posts(int page, int page_size, const std::string& status, int& total,
                       int64_t viewer_id, bool is_admin) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return json::array{};

    std::string count_sql = "SELECT COUNT(*) FROM posts";
    std::string list_sql = "SELECT p.id, p.title, p.summary, p.user_id, p.status, p.view_count, "
                           "DATE_FORMAT(p.created_at, '%Y-%m-%d %H:%i:%s') AS created_at, "
                           "DATE_FORMAT(p.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at, u.username, "
                           "(SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id) AS like_count, "
                           "(SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count "
                           "FROM posts p LEFT JOIN users u ON p.user_id = u.id";
    std::vector<std::string> where_binds;

    // @cuiruoni+P0安全修复：按状态和查看者权限构建WHERE条件，草稿只对作者/管理员可见
    if (status == "published") {
        count_sql += " WHERE status = ?";
        list_sql += " WHERE status = ?";
        where_binds.push_back("published");
    } else if (status == "draft") {
        if (is_admin) {
            count_sql += " WHERE status = ?";
            list_sql += " WHERE status = ?";
            where_binds.push_back("draft");
        } else {
            count_sql += " WHERE status = ? AND user_id = ?";
            list_sql += " WHERE status = ? AND user_id = ?";
            where_binds.push_back("draft");
            where_binds.push_back(std::to_string(viewer_id));
        }
    } else { // all
        if (is_admin) {
            // @cuiruoni+管理员可查看全部状态
        } else if (viewer_id <= 0) {
            // @cuiruoni+兜底：未认证查看者一律只看已发布文章
            count_sql += " WHERE status = ?";
            list_sql += " WHERE status = ?";
            where_binds.push_back("published");
        } else {
            count_sql += " WHERE status = ? OR (status = ? AND user_id = ?)";
            list_sql += " WHERE status = ? OR (status = ? AND user_id = ?)";
            where_binds.push_back("published");
            where_binds.push_back("draft");
            where_binds.push_back(std::to_string(viewer_id));
        }
    }
    list_sql += " ORDER BY created_at DESC LIMIT ? OFFSET ?";

    try {
        auto count_stmt = sess->sql(count_sql);
        for (const auto& b : where_binds) {
            count_stmt.bind(b);
        }
        auto count_result = count_stmt.execute();
        auto count_row = count_result.fetchOne();
        total = static_cast<int>(count_row[0]);

        int offset = (page - 1) * page_size;
        auto list_stmt = sess->sql(list_sql);
        for (const auto& b : where_binds) {
            list_stmt.bind(b);
        }
        list_stmt.bind(page_size).bind(offset);
        auto result = list_stmt.execute();

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
            obj["author"] = mysqlx_helper::is_null(row, 8) ? "" : mysqlx_helper::to_string(row[8]);
            obj["like_count"] = mysqlx_helper::to_json(row[9]);
            obj["comment_count"] = mysqlx_helper::to_json(row[10]);
            arr.push_back(obj);
        }
        return arr;
    } catch (const std::exception& e) {
        spdlog::error("post_dao::list_posts error: {}", e.what());
        return json::array{};
    }
}

// @cuiruoni+某作者自己的全部文章（含草稿）：与 list_posts 相同行结构，仅 WHERE 不同
json::array list_by_author(int64_t author_id, int page, int page_size, int& total) {
    total = 0;
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return json::array{};

    try {
        auto count_result = sess->sql("SELECT COUNT(*) FROM posts WHERE user_id = ?")
                                .bind(author_id).execute();
        total = static_cast<int>(count_result.fetchOne()[0]);

        int offset = (page - 1) * page_size;
        auto result = sess->sql(
            "SELECT p.id, p.title, p.summary, p.user_id, p.status, p.view_count, "
            "DATE_FORMAT(p.created_at, '%Y-%m-%d %H:%i:%s') AS created_at, "
            "DATE_FORMAT(p.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at, u.username, "
            "(SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id) AS like_count, "
            "(SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count "
            "FROM posts p LEFT JOIN users u ON p.user_id = u.id "
            "WHERE p.user_id = ? ORDER BY p.updated_at DESC LIMIT ? OFFSET ?")
            .bind(author_id).bind(page_size).bind(offset).execute();

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
            obj["author"] = mysqlx_helper::is_null(row, 8) ? "" : mysqlx_helper::to_string(row[8]);
            obj["like_count"] = mysqlx_helper::to_json(row[9]);
            obj["comment_count"] = mysqlx_helper::to_json(row[10]);
            arr.push_back(obj);
        }
        return arr;
    } catch (const std::exception& e) {
        spdlog::error("post_dao::list_by_author error: {}", e.what());
        return json::array{};
    }
}

Post find_by_id(int64_t id) {
    auto sess = MysqlPool::instance().acquire();
    Post p;
    if (!sess) return p;

    try {
        auto result = sess->sql(
            "SELECT p.id, p.title, p.content_md, p.content_html, p.summary, p.user_id, p.status, p.view_count, "
            "DATE_FORMAT(p.created_at, '%Y-%m-%d %H:%i:%s') AS created_at, "
            "DATE_FORMAT(p.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at, u.username, "
            "(SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id) AS like_count, "
            "(SELECT COUNT(*) FROM post_bookmarks pb WHERE pb.post_id = p.id) AS bookmark_count, "
            "(SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count "
            "FROM posts p LEFT JOIN users u ON p.user_id = u.id WHERE p.id = ?")
            .bind(id).execute();

        auto row = result.fetchOne();
        if (row.isNull()) return p;

        p.id = static_cast<int64_t>(row[0]);
        p.title = mysqlx_helper::to_string(row[1]);
        p.content_md = mysqlx_helper::to_string(row[2]);
        p.content_html = mysqlx_helper::to_string(row[3]);
        p.summary = row[4].isNull() ? "" : mysqlx_helper::to_string(row[4]);
        p.user_id = static_cast<int64_t>(row[5]);
        p.status = mysqlx_helper::to_string(row[6]);
        p.view_count = static_cast<int>(static_cast<uint64_t>(row[7]));
        p.created_at = mysqlx_helper::to_string(row[8]);
        p.updated_at = mysqlx_helper::to_string(row[9]);
        p.author = mysqlx_helper::is_null(row, 10) ? "" : mysqlx_helper::to_string(row[10]);
        p.like_count = static_cast<int>(static_cast<int64_t>(row[11]));
        p.bookmark_count = static_cast<int>(static_cast<int64_t>(row[12]));
        p.comment_count = static_cast<int>(static_cast<int64_t>(row[13]));

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
            "SELECT p.id, p.title, p.status, p.view_count, "
            "DATE_FORMAT(p.created_at, '%Y-%m-%d %H:%i:%s') AS created_at, "
            "DATE_FORMAT(p.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at, "
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
            obj["author_id"] = mysqlx_helper::to_json(row[6]);
            obj["author"] = mysqlx_helper::is_null(row, 7) ? "" : mysqlx_helper::to_string(row[7]);
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

// @cuiruoni+点赞/收藏功能（P1修复）
int64_t count_likes(int64_t post_id) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return 0;
    try {
        auto result = sess->sql("SELECT COUNT(*) FROM post_likes WHERE post_id = ?")
            .bind(post_id).execute();
        return static_cast<int64_t>(result.fetchOne()[0]);
    } catch (const std::exception& e) {
        spdlog::error("post_dao::count_likes error: {}", e.what());
        return 0;
    }
}

int64_t count_bookmarks(int64_t post_id) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return 0;
    try {
        auto result = sess->sql("SELECT COUNT(*) FROM post_bookmarks WHERE post_id = ?")
            .bind(post_id).execute();
        return static_cast<int64_t>(result.fetchOne()[0]);
    } catch (const std::exception& e) {
        spdlog::error("post_dao::count_bookmarks error: {}", e.what());
        return 0;
    }
}

int64_t count_comments(int64_t post_id) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return 0;
    try {
        auto result = sess->sql("SELECT COUNT(*) FROM comments WHERE post_id = ?")
            .bind(post_id).execute();
        return static_cast<int64_t>(result.fetchOne()[0]);
    } catch (const std::exception& e) {
        spdlog::error("post_dao::count_comments error: {}", e.what());
        return 0;
    }
}

bool is_liked(int64_t post_id, int64_t user_id) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return false;
    try {
        auto result = sess->sql("SELECT 1 FROM post_likes WHERE user_id = ? AND post_id = ?")
            .bind(user_id).bind(post_id).execute();
        return result.count() > 0;
    } catch (const std::exception& e) {
        spdlog::error("post_dao::is_liked error: {}", e.what());
        return false;
    }
}

bool is_bookmarked(int64_t post_id, int64_t user_id) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return false;
    try {
        auto result = sess->sql("SELECT 1 FROM post_bookmarks WHERE user_id = ? AND post_id = ?")
            .bind(user_id).bind(post_id).execute();
        return result.count() > 0;
    } catch (const std::exception& e) {
        spdlog::error("post_dao::is_bookmarked error: {}", e.what());
        return false;
    }
}

bool add_like(int64_t post_id, int64_t user_id) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return false;
    try {
        auto result = sess->sql("INSERT IGNORE INTO post_likes (user_id, post_id) VALUES (?, ?)")
            .bind(user_id).bind(post_id).execute();
        return result.getAffectedItemsCount() > 0;
    } catch (const std::exception& e) {
        spdlog::error("post_dao::add_like error: {}", e.what());
        return false;
    }
}

bool remove_like(int64_t post_id, int64_t user_id) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return false;
    try {
        sess->sql("DELETE FROM post_likes WHERE user_id = ? AND post_id = ?")
            .bind(user_id).bind(post_id).execute();
        return true;
    } catch (const std::exception& e) {
        spdlog::error("post_dao::remove_like error: {}", e.what());
        return false;
    }
}

bool add_bookmark(int64_t post_id, int64_t user_id) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return false;
    try {
        auto result = sess->sql("INSERT IGNORE INTO post_bookmarks (user_id, post_id) VALUES (?, ?)")
            .bind(user_id).bind(post_id).execute();
        return result.getAffectedItemsCount() > 0;
    } catch (const std::exception& e) {
        spdlog::error("post_dao::add_bookmark error: {}", e.what());
        return false;
    }
}

bool remove_bookmark(int64_t post_id, int64_t user_id) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return false;
    try {
        sess->sql("DELETE FROM post_bookmarks WHERE user_id = ? AND post_id = ?")
            .bind(user_id).bind(post_id).execute();
        return true;
    } catch (const std::exception& e) {
        spdlog::error("post_dao::remove_bookmark error: {}", e.what());
        return false;
    }
}

json::array list_liked_posts(int64_t user_id, int page, int page_size, int& total) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return json::array{};
    try {
        auto count_result = sess->sql(
            "SELECT COUNT(*) FROM post_likes pl JOIN posts p ON p.id = pl.post_id "
            "WHERE pl.user_id = ? AND p.status = 'published'")
            .bind(user_id).execute();
        total = static_cast<int>(static_cast<int64_t>(count_result.fetchOne()[0]));

        int offset = (page - 1) * page_size;
        auto result = sess->sql(
            "SELECT p.id, p.title, p.summary, p.status, p.view_count, "
            "DATE_FORMAT(p.created_at, '%Y-%m-%d %H:%i:%s') AS created_at, "
            "DATE_FORMAT(p.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at, u.username, "
            "(SELECT COUNT(*) FROM post_likes pl2 WHERE pl2.post_id = p.id) AS like_count, "
            "(SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count "
            "FROM post_likes pl JOIN posts p ON p.id = pl.post_id "
            "LEFT JOIN users u ON p.user_id = u.id "
            "WHERE pl.user_id = ? AND p.status = 'published' "
            "ORDER BY pl.created_at DESC LIMIT ? OFFSET ?")
            .bind(user_id).bind(page_size).bind(offset).execute();

        json::array arr;
        for (auto row : result) {
            json::object obj;
            obj["id"] = mysqlx_helper::to_json(row[0]);
            obj["title"] = mysqlx_helper::to_string(row[1]);
            obj["summary"] = mysqlx_helper::is_null(row, 2) ? "" : mysqlx_helper::to_string(row[2]);
            obj["status"] = mysqlx_helper::to_string(row[3]);
            obj["view_count"] = mysqlx_helper::to_json(row[4]);
            obj["created_at"] = mysqlx_helper::to_string(row[5]);
            obj["updated_at"] = mysqlx_helper::is_null(row, 6) ? "" : mysqlx_helper::to_string(row[6]);
            obj["author"] = mysqlx_helper::is_null(row, 7) ? "" : mysqlx_helper::to_string(row[7]);
            obj["like_count"] = mysqlx_helper::to_json(row[8]);
            obj["comment_count"] = mysqlx_helper::to_json(row[9]);
            arr.push_back(obj);
        }
        return arr;
    } catch (const std::exception& e) {
        spdlog::error("post_dao::list_liked_posts error: {}", e.what());
        return json::array{};
    }
}

json::array list_bookmarked_posts(int64_t user_id, int page, int page_size, int& total) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return json::array{};
    try {
        auto count_result = sess->sql(
            "SELECT COUNT(*) FROM post_bookmarks pb JOIN posts p ON p.id = pb.post_id "
            "WHERE pb.user_id = ? AND p.status = 'published'")
            .bind(user_id).execute();
        total = static_cast<int>(static_cast<int64_t>(count_result.fetchOne()[0]));

        int offset = (page - 1) * page_size;
        auto result = sess->sql(
            "SELECT p.id, p.title, p.summary, p.status, p.view_count, "
            "DATE_FORMAT(p.created_at, '%Y-%m-%d %H:%i:%s') AS created_at, "
            "DATE_FORMAT(p.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at, u.username, "
            "(SELECT COUNT(*) FROM post_likes pl2 WHERE pl2.post_id = p.id) AS like_count, "
            "(SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count "
            "FROM post_bookmarks pb JOIN posts p ON p.id = pb.post_id "
            "LEFT JOIN users u ON p.user_id = u.id "
            "WHERE pb.user_id = ? AND p.status = 'published' "
            "ORDER BY pb.created_at DESC LIMIT ? OFFSET ?")
            .bind(user_id).bind(page_size).bind(offset).execute();

        json::array arr;
        for (auto row : result) {
            json::object obj;
            obj["id"] = mysqlx_helper::to_json(row[0]);
            obj["title"] = mysqlx_helper::to_string(row[1]);
            obj["summary"] = mysqlx_helper::is_null(row, 2) ? "" : mysqlx_helper::to_string(row[2]);
            obj["status"] = mysqlx_helper::to_string(row[3]);
            obj["view_count"] = mysqlx_helper::to_json(row[4]);
            obj["created_at"] = mysqlx_helper::to_string(row[5]);
            obj["updated_at"] = mysqlx_helper::is_null(row, 6) ? "" : mysqlx_helper::to_string(row[6]);
            obj["author"] = mysqlx_helper::is_null(row, 7) ? "" : mysqlx_helper::to_string(row[7]);
            obj["like_count"] = mysqlx_helper::to_json(row[8]);
            obj["comment_count"] = mysqlx_helper::to_json(row[9]);
            arr.push_back(obj);
        }
        return arr;
    } catch (const std::exception& e) {
        spdlog::error("post_dao::list_bookmarked_posts error: {}", e.what());
        return json::array{};
    }
}

}
