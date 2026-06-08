#include "services/post_service.h"
#include "services/markdown_service.h"
#include "db/mysql_pool.h"
#include "db/redis_pool.h"
#include "utils/logger.h"
#include "utils/mysqlx_helper.h"
#include "utils/sanitize.h"

#include <sstream>
#include <unordered_set>

namespace post_service {

json::object post_to_json(const Post& post) {
    json::array tags;
    for (const auto& tag : post.tags) {
        tags.push_back(tag);
    }

    return json::object{
        {"id", post.id},
        {"title", post.title},
        {"content_md", post.content_md},
        {"content_html", post.content_html},
        {"summary", post.summary},
        {"user_id", post.user_id},
        {"tags", tags},
        {"status", post.status},
        {"view_count", post.view_count},
        {"created_at", post.created_at},
        {"updated_at", post.updated_at}
    };
}

Post json_to_post(const json::object& obj) {
    Post p;
    // @cuiruoni+输入消毒：标题转义HTML防止XSS，截断过长字段
    if (obj.contains("title")) p.title = sanitize::truncate(sanitize::clean_text(
        std::string(obj.at("title").as_string())), 200);
    if (obj.contains("content_md")) p.content_md = std::string(obj.at("content_md").as_string());
    if (obj.contains("summary")) p.summary = sanitize::truncate(sanitize::clean_text(
        std::string(obj.at("summary").as_string())), 500);
    if (obj.contains("tags") && obj.at("tags").is_array()) {
        for (const auto& tag : obj.at("tags").as_array()) {
            if (!tag.is_string()) continue;
            std::string name(tag.as_string());
            if (!name.empty() && name.size() <= 50) {
                p.tags.push_back(name);
            }
        }
    }
    if (obj.contains("user_id")) p.user_id = obj.at("user_id").as_int64();
    if (obj.contains("status")) p.status = std::string(obj.at("status").as_string());
    return p;
}

static std::vector<std::string> load_tags(mysqlx::Session* sess, int64_t post_id) {
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
}

static void sync_tags(mysqlx::Session* sess, int64_t post_id, const std::vector<std::string>& tags) {
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
}

// @cuiruoni+分页查询文章列表，支持按status过滤，返回文章摘要信息
// @cuiruoni+先查总数再查列表，避免两次全量查询
json::array list_posts(int page, int page_size, const std::string& status, int& total) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return json::array{};

    std::string count_sql = "SELECT COUNT(*) FROM posts";
    std::string list_sql = "SELECT id, title, summary, user_id, status, view_count, created_at, updated_at FROM posts";
    if (status != "all") {
        count_sql += " WHERE status = ?";
        list_sql += " WHERE status = ?";
    }
    list_sql += " ORDER BY created_at DESC LIMIT ? OFFSET ?"; // @cuiruoni+按创建时间倒序，使用LIMIT/OFFSET分页

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
            Post p;
            p.id = static_cast<int64_t>(row[0]);
            p.title = mysqlx_helper::to_string(row[1]);
            p.summary = mysqlx_helper::is_null(row, 2) ? "" : mysqlx_helper::to_string(row[2]);
            p.user_id = static_cast<int64_t>(row[3]);
            p.status = mysqlx_helper::to_string(row[4]);
            p.view_count = static_cast<int>(static_cast<uint64_t>(row[5]));
            p.created_at = mysqlx_helper::to_string(row[6]);
            p.updated_at = mysqlx_helper::to_string(row[7]);
            arr.push_back(post_to_json(p));
        }

        return arr;
    } catch (const std::exception& e) {
        spdlog::error("list_posts error: {}", e.what());
        return json::array{};
    }
}

// @cuiruoni+获取单篇文章详情，查询后自动将浏览量+1
Post get_post(int64_t id) {
    auto sess = MysqlPool::instance().acquire();
    Post p;
    if (!sess) return p;

    try {
        auto result = sess->sql(
            "SELECT id, title, content_md, content_html, summary, user_id, status, view_count, created_at, updated_at "
            "FROM posts WHERE id = ?")
            .bind(id).execute();

        auto row = result.fetchOne();
        if (row.isNull()) {
            return p;
        }

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

        // @cuiruoni+浏览量自增：每次读取文章详情时+1，非原子操作但在单线程io_context下安全
        sess->sql("UPDATE posts SET view_count = view_count + 1 WHERE id = ?")
            .bind(id).execute();

        // @cuiruoni+加载文章关联的标签
        p.tags = load_tags(sess, id);

    } catch (const std::exception& e) {
        spdlog::error("get_post error: {}", e.what());
    }
    return p;
}

// @cuiruoni+创建文章：自动将Markdown渲染为HTML，未提供摘要时截取前200字符
int64_t create_post(const Post& post) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return 0;

    try {
        // @cuiruoni+Markdown→HTML渲染，使用cmark库转换
        std::string html = markdown_service::render(post.content_md);
        // @cuiruoni+自动摘要：未提供摘要时截取Markdown原文前200字符
        std::string summary = post.summary;
        if (summary.empty() && post.content_md.size() > 200) {
            summary = post.content_md.substr(0, 200);
        } else if (summary.empty()) {
            summary = post.content_md;
        }

        sess->sql(
            "INSERT INTO posts (title, content_md, content_html, summary, user_id, status) "
            "VALUES (?, ?, ?, ?, ?, ?)")
            .bind(post.title)
            .bind(post.content_md)
            .bind(html)
            .bind(summary)
            .bind(post.user_id)
            .bind(post.status.empty() ? std::string("draft") : post.status)
            .execute();

        auto result = sess->sql("SELECT LAST_INSERT_ID()").execute();
        int64_t id = static_cast<int64_t>(result.fetchOne()[0]);

        // @cuiruoni+创建文章后同步标签关联到post_tags表
        if (!post.tags.empty()) {
            sync_tags(sess, id, post.tags);
        }

        return id;
    } catch (const std::exception& e) {
        spdlog::error("create_post error: {}", e.what());
        return 0;
    }
}

// @cuiruoni+更新文章：重新渲染Markdown→HTML
bool update_post(int64_t id, const Post& post) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return false;

    try {
        std::string html = markdown_service::render(post.content_md);
        sess->sql(
            "UPDATE posts SET title = ?, content_md = ?, content_html = ?, "
            "summary = ?, status = ? WHERE id = ?")
            .bind(post.title)
            .bind(post.content_md)
            .bind(html)
            .bind(post.summary)
            .bind(post.status)
            .bind(id)
            .execute();

        // @cuiruoni+更新文章后同步标签关联
        sync_tags(sess, id, post.tags);

        return true;
    } catch (const std::exception& e) {
        spdlog::error("update_post error: {}", e.what());
        return false;
    }
}

bool delete_post(int64_t id) {
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
            spdlog::error("delete_post rollback error: {}", rollback_error.what());
        }
        spdlog::error("delete_post error: {}", e.what());
        return false;
    }
}

bool can_modify_post(int64_t post_id, int64_t user_id, const std::string& role) {
    if (role == "admin") return true;

    auto sess = MysqlPool::instance().acquire();
    if (!sess) return false;

    try {
        auto result = sess->sql("SELECT user_id FROM posts WHERE id = ?")
            .bind(post_id).execute();
        auto row = result.fetchOne();
        if (row.isNull()) return false;
        return static_cast<int64_t>(row[0]) == user_id;
    } catch (const std::exception& e) {
        spdlog::error("can_modify_post error: {}", e.what());
        return false;
    }
}

}
