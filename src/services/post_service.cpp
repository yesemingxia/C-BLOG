#include "services/post_service.h"
#include "services/markdown_service.h"
#include "db/mysql_pool.h"
#include "db/redis_pool.h"
#include "utils/logger.h"
#include "utils/mysqlx_helper.h"

#include <sstream>

namespace post_service {

json::object post_to_json(const Post& post) {
    return json::object{
        {"id", post.id},
        {"title", post.title},
        {"content_md", post.content_md},
        {"content_html", post.content_html},
        {"summary", post.summary},
        {"user_id", post.user_id},
        {"status", post.status},
        {"view_count", post.view_count},
        {"created_at", post.created_at},
        {"updated_at", post.updated_at}
    };
}

Post json_to_post(const json::object& obj) {
    Post p;
    if (obj.contains("title")) p.title = std::string(obj.at("title").as_string());
    if (obj.contains("content_md")) p.content_md = std::string(obj.at("content_md").as_string());
    if (obj.contains("summary")) p.summary = std::string(obj.at("summary").as_string());
    if (obj.contains("user_id")) p.user_id = obj.at("user_id").as_int64();
    if (obj.contains("status")) p.status = std::string(obj.at("status").as_string());
    return p;
}

json::array list_posts(int page, int page_size, const std::string& status, int& total) {
    auto sess = MysqlPool::instance().get();
    if (!sess) return json::array{};

    std::string count_sql = "SELECT COUNT(*) FROM posts";
    std::string list_sql = "SELECT id, title, summary, user_id, status, view_count, created_at, updated_at FROM posts";
    if (status != "all") {
        count_sql += " WHERE status = :status";
        list_sql += " WHERE status = :status";
    }
    list_sql += " ORDER BY created_at DESC LIMIT :lim OFFSET :off";

    try {
        auto count_result = status != "all"
            ? sess->sql(count_sql).bind("status", status).execute()
            : sess->sql(count_sql).execute();
        auto count_row = count_result.fetchOne();
        total = static_cast<int>(count_row[0]);

        int offset = (page - 1) * page_size;
        auto result = status != "all"
            ? sess->sql(list_sql).bind("status", status).bind("lim", page_size).bind("off", offset).execute()
            : sess->sql(list_sql).bind("lim", page_size).bind("off", offset).execute();

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

        MysqlPool::instance().release(sess);
        return arr;
    } catch (const std::exception& e) {
        spdlog::error("list_posts error: {}", e.what());
        MysqlPool::instance().release(sess);
        return json::array{};
    }
}

Post get_post(int64_t id) {
    auto sess = MysqlPool::instance().get();
    Post p;
    if (!sess) return p;

    try {
        auto result = sess->sql(
            "SELECT id, title, content_md, content_html, summary, user_id, status, view_count, created_at, updated_at "
            "FROM posts WHERE id = :id")
            .bind("id", id).execute();

        auto row = result.fetchOne();
        if (row.isNull()) {
            MysqlPool::instance().release(sess);
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

        sess->sql("UPDATE posts SET view_count = view_count + 1 WHERE id = :id")
            .bind("id", id).execute();

        MysqlPool::instance().release(sess);
    } catch (const std::exception& e) {
        spdlog::error("get_post error: {}", e.what());
        MysqlPool::instance().release(sess);
    }
    return p;
}

int64_t create_post(const Post& post) {
    auto sess = MysqlPool::instance().get();
    if (!sess) return 0;

    try {
        std::string html = markdown_service::render(post.content_md);
        std::string summary = post.summary;
        if (summary.empty() && post.content_md.size() > 200) {
            summary = post.content_md.substr(0, 200);
        } else if (summary.empty()) {
            summary = post.content_md;
        }

        sess->sql(
            "INSERT INTO posts (title, content_md, content_html, summary, user_id, status) "
            "VALUES (:title, :md, :html, :summary, :uid, :status)")
            .bind("title", post.title)
            .bind("md", post.content_md)
            .bind("html", html)
            .bind("summary", summary)
            .bind("uid", post.user_id)
            .bind("status", post.status.empty() ? std::string("draft") : post.status)
            .execute();

        auto result = sess->sql("SELECT LAST_INSERT_ID()").execute();
        int64_t id = static_cast<int64_t>(result.fetchOne()[0]);

        MysqlPool::instance().release(sess);
        return id;
    } catch (const std::exception& e) {
        spdlog::error("create_post error: {}", e.what());
        MysqlPool::instance().release(sess);
        return 0;
    }
}

bool update_post(int64_t id, const Post& post) {
    auto sess = MysqlPool::instance().get();
    if (!sess) return false;

    try {
        std::string html = markdown_service::render(post.content_md);
        sess->sql(
            "UPDATE posts SET title = :title, content_md = :md, content_html = :html, "
            "summary = :summary, status = :status WHERE id = :id")
            .bind("title", post.title)
            .bind("md", post.content_md)
            .bind("html", html)
            .bind("summary", post.summary)
            .bind("status", post.status)
            .bind("id", id)
            .execute();

        MysqlPool::instance().release(sess);
        return true;
    } catch (const std::exception& e) {
        spdlog::error("update_post error: {}", e.what());
        MysqlPool::instance().release(sess);
        return false;
    }
}

bool delete_post(int64_t id) {
    auto sess = MysqlPool::instance().get();
    if (!sess) return false;

    try {
        sess->sql("DELETE FROM posts WHERE id = :id").bind("id", id).execute();
        MysqlPool::instance().release(sess);
        return true;
    } catch (const std::exception& e) {
        spdlog::error("delete_post error: {}", e.what());
        MysqlPool::instance().release(sess);
        return false;
    }
}

}
