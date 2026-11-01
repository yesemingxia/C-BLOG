#include "dao/post_dao.h"
#include "dao/dao_utils.h"
#include "db/mysql_pool.h"
#include "utils/logger.h"
#include "utils/mysqlx_helper.h"
#include "utils/sanitize.h"
#include "utils/storage.h"

#include <cstdio>
#include <ctime>
#include <map>
#include <unordered_map>
#include <unordered_set>

namespace post_dao {

namespace {

// @cuiruoni+列表可见性谓词（count/list 共用，避免两处条件漂移）：
// @cuiruoni+匿名=published+public；登录=published+(public|members|自己的 private)+自己的草稿；管理员不限制
std::string build_visibility_where(const std::string& status, int64_t viewer_id, bool is_admin,
                                   std::vector<std::string>& binds) {
    if (is_admin) {
        if (status == "published" || status == "draft") {
            binds.push_back(status);
            return " WHERE status = ?";
        }
        return "";
    }
    if (viewer_id <= 0) {
        return " WHERE status = 'published' AND visibility = 'public'";
    }
    if (status == "draft") {
        binds.push_back(std::to_string(viewer_id));
        return " WHERE status = 'draft' AND user_id = ?";
    }
    if (status == "published") {
        binds.push_back(std::to_string(viewer_id));
        return " WHERE status = 'published' AND "
               "(visibility IN ('public','members') OR (visibility = 'private' AND user_id = ?))";
    }
    binds.push_back(std::to_string(viewer_id));
    binds.push_back(std::to_string(viewer_id));
    return " WHERE (status = 'published' AND "
           "(visibility IN ('public','members') OR (visibility = 'private' AND user_id = ?)))"
           " OR (status = 'draft' AND user_id = ?)";
}

// @cuiruoni+列表阅读时长：按字符数/500 向上取整，与前端 readMinutes 口径一致
constexpr const char* kReadMinutesSql =
    "CAST(GREATEST(1, CEIL(COALESCE(CHAR_LENGTH(p.content_md), 0) / 500)) AS UNSIGNED) AS read_minutes";

} // namespace

json::array list_posts(int page, int page_size, const std::string& status, int& total,
                       int64_t viewer_id, bool is_admin) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return json::array{};

    std::string count_sql = "SELECT COUNT(*) FROM posts";
    std::string list_sql = "SELECT p.id, p.title, p.summary, p.user_id, p.status, p.view_count, "
                           "DATE_FORMAT(p.created_at, '%Y-%m-%d %H:%i:%s') AS created_at, "
                           "DATE_FORMAT(p.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at, u.username, "
                           "(SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id) AS like_count, "
                           "(SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count, "
                           "p.cover, p.visibility, ";
    list_sql += kReadMinutesSql;
    list_sql += " FROM posts p LEFT JOIN users u ON p.user_id = u.id";
    std::vector<std::string> where_binds;

    // @cuiruoni+P0安全修复：状态 + 可见性统一由 build_visibility_where 生成，
    // @cuiruoni+匿名只能看 public，登录用户额外可见 members/自己的 private 与草稿
    const std::string where = build_visibility_where(status, viewer_id, is_admin, where_binds);
    count_sql += where;
    list_sql += where;
    // @cuiruoni+加 p.id 兜底：同一秒发布/同一批导入的文章在 created_at 上并列，MySQL 不保证并列行的先后，
    // @cuiruoni+翻页时会「同一条在两张页里都出现，另一条哪一页都不出现」。
    list_sql += " ORDER BY p.created_at DESC, p.id DESC LIMIT ? OFFSET ?";

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
            obj["cover"] = mysqlx_helper::is_null(row, 11) ? "" : mysqlx_helper::to_string(row[11]);
            obj["visibility"] = mysqlx_helper::to_string(row[12]);
            obj["read_minutes"] = mysqlx_helper::to_json(row[13]);
            arr.push_back(obj);
        }
        // @cuiruoni+列表批量补标签（一次 IN 查询，避免逐篇 N+1）
        attach_tags(arr);
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
        std::string list_sql =
            "SELECT p.id, p.title, p.summary, p.user_id, p.status, p.view_count, "
            "DATE_FORMAT(p.created_at, '%Y-%m-%d %H:%i:%s') AS created_at, "
            "DATE_FORMAT(p.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at, u.username, "
            "(SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id) AS like_count, "
            "(SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count, "
            "p.cover, p.visibility, ";
        list_sql += kReadMinutesSql;
        list_sql += " FROM posts p LEFT JOIN users u ON p.user_id = u.id "
                    "WHERE p.user_id = ? ORDER BY p.updated_at DESC, p.id DESC LIMIT ? OFFSET ?";
        auto result = sess->sql(list_sql)
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
            obj["cover"] = mysqlx_helper::is_null(row, 11) ? "" : mysqlx_helper::to_string(row[11]);
            obj["visibility"] = mysqlx_helper::to_string(row[12]);
            obj["read_minutes"] = mysqlx_helper::to_json(row[13]);
            arr.push_back(obj);
        }
        attach_tags(arr);
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
            "(SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count, "
            "p.cover, p.visibility "
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
        p.cover = mysqlx_helper::is_null(row, 14) ? "" : mysqlx_helper::to_string(row[14]);
        p.visibility = mysqlx_helper::to_string(row[15]);

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
        // @cuiruoni+updated_at = updated_at 是刻意的：posts.updated_at 带 ON UPDATE CURRENT_TIMESTAMP，
        // @cuiruoni+不加这句则每次浏览量 +1 都会把「编辑时间」刷成当前时间，
        // @cuiruoni+于是 list_by_author 的 ORDER BY p.updated_at DESC（个人中心「我的文章」）
        // @cuiruoni+和后台 sort=updated_at 都变成「按最后被浏览时间」排序。
        sess->sql("UPDATE posts SET view_count = view_count + 1, updated_at = updated_at WHERE id = ?")
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
            "INSERT INTO posts (title, content_md, content_html, summary, user_id, status, cover, visibility) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
            .bind(post.title)
            .bind(post.content_md)
            .bind(content_html)
            .bind(summary)
            .bind(post.user_id)
            .bind(post.status.empty() ? std::string("draft") : post.status)
            .bind(post.cover)
            .bind(post.visibility.empty() ? std::string("public") : post.visibility)
            .execute();

        auto result = sess->sql("SELECT LAST_INSERT_ID()").execute();
        int64_t id = static_cast<int64_t>(result.fetchOne()[0]);
        return id;
    } catch (const std::exception& e) {
        spdlog::error("post_dao::insert error: {}", e.what());
        return 0;
    }
}

bool update_patch(int64_t id, const PostPatch& patch, const std::string& content_html) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return false;

    try {
        // @cuiruoni+B3：只 SET 请求里出现的列，缺省字段保持数据库原值
        std::string sql = "UPDATE posts SET ";
        std::vector<std::string> values;
        auto add = [&](const char* column, const std::string& value) {
            if (!values.empty()) sql += ", ";
            sql += column;
            sql += " = ?";
            values.push_back(value);
        };

        if (patch.title) add("title", *patch.title);
        if (patch.content_md) {
            add("content_md", *patch.content_md);
            add("content_html", content_html);
        }
        if (patch.summary) add("summary", *patch.summary);
        if (patch.status) add("status", *patch.status);
        if (patch.cover) add("cover", *patch.cover);
        if (patch.visibility) add("visibility", *patch.visibility);
        if (values.empty()) return true;

        sql += " WHERE id = ?";
        auto stmt = sess->sql(sql);
        for (const auto& value : values) stmt.bind(value);
        stmt.bind(id).execute();
        return true;
    } catch (const std::exception& e) {
        spdlog::error("post_dao::update_patch error: {}", e.what());
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

// @cuiruoni+批量为列表结果补 tags：一次 IN 查询换 N 次逐篇查询，
// @cuiruoni+列表/搜索/标签三个入口共用，字段结构与详情页的 tags 保持一致
void attach_tags(json::array& posts) {
    if (posts.empty()) return;

    std::vector<int64_t> ids;
    ids.reserve(posts.size());
    for (auto& value : posts) {
        int64_t pid = 0;
        if (value.is_object()) {
            const auto& obj = value.as_object();
            auto it = obj.find("id");
            if (it != obj.end()) {
                if (it->value().is_int64()) pid = it->value().as_int64();
                else if (it->value().is_uint64()) pid = static_cast<int64_t>(it->value().as_uint64());
            }
        }
        ids.push_back(pid);
    }

    std::map<int64_t, json::array> tags_by_post;
    auto sess = MysqlPool::instance().acquire();
    if (sess) {
        std::string sql =
            "SELECT pt.post_id, t.name FROM post_tags pt "
            "JOIN tags t ON t.id = pt.tag_id WHERE pt.post_id IN (";
        size_t valid = 0;
        for (int64_t pid : ids) {
            if (pid <= 0) continue;
            if (valid++ > 0) sql += ",";
            sql += "?";
        }
        if (valid > 0) {
            sql += ") ORDER BY pt.post_id, t.name";
            try {
                auto stmt = sess->sql(sql);
                for (int64_t pid : ids) {
                    if (pid > 0) stmt.bind(pid);
                }
                auto result = stmt.execute();
                for (auto row : result) {
                    int64_t pid = static_cast<int64_t>(row[0]);
                    tags_by_post[pid].push_back(
                        json::value(mysqlx_helper::to_string(row[1])));
                }
            } catch (const std::exception& e) {
                spdlog::error("post_dao::attach_tags error: {}", e.what());
            }
        }
    }

    for (size_t i = 0; i < posts.size(); ++i) {
        if (!posts[i].is_object()) continue;
        auto& obj = posts[i].as_object();
        auto it = tags_by_post.find(ids[i]);
        obj["tags"] = it != tags_by_post.end() ? it->second : json::array{};
    }
}

void sync_tags(int64_t post_id, const std::vector<std::string>& tags) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return;

    try {
        // @cuiruoni+B3 之后「只改 tags」是一条独立更新路径，原来 DELETE 与 INSERT 之间没有事务：
        // @cuiruoni+并发读文章的列表接口会在这中间抓到 tags 为空的文章；
        // @cuiruoni+中途抛异常更糟 —— 旧标签已删、新标签没写，标签就这么丢了。
        // @cuiruoni+与 delete_by_id 同一套写法（startTransaction / commit / rollback）。
        sess->startTransaction();
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
        sess->commit();
    } catch (const std::exception& e) {
        try {
            sess->rollback();
        } catch (const std::exception& rollback_error) {
            spdlog::error("post_dao::sync_tags rollback error: {}", rollback_error.what());
        }
        spdlog::error("post_dao::sync_tags error: {}", e.what());
    }
}

std::vector<std::string> list_media_texts(int64_t post_id, int64_t user_id) {
    std::vector<std::string> texts;
    if (post_id <= 0 && user_id <= 0) return texts;  // @cuiruoni+不允许无条件全表扫

    auto sess = MysqlPool::instance().acquire();
    if (!sess) return texts;

    try {
        std::string sql = "SELECT cover, content_md FROM posts WHERE ";
        if (post_id > 0) sql += "id = ?";
        else sql += "user_id = ?";

        auto result = sess->sql(sql).bind(post_id > 0 ? post_id : user_id).execute();
        for (auto row = result.begin(); row != result.end(); ++row) {
            if (!(*row)[0].isNull()) texts.push_back(mysqlx_helper::to_string((*row)[0]));
            if (!(*row)[1].isNull()) texts.push_back(mysqlx_helper::to_string((*row)[1]));
        }
    } catch (const std::exception& e) {
        spdlog::error("post_dao::list_media_texts error: {}", e.what());
    }
    return texts;
}

int count_image_references(const std::string& name) {
    if (!storage::is_safe_image_name(name)) return -1;  // @cuiruoni+不是我们生成的文件名，一律视为「不可删」

    auto sess = MysqlPool::instance().acquire();
    if (!sess) return -1;

    try {
        // @cuiruoni+文章侧要看四个字段而不是只看 cover + 正文：作者可以把图片 URL 手贴进标题或摘要，
        // @cuiruoni+摘要又常在正文改图后被单独留着 —— 少查一个字段就可能删掉别人还在显示的图。
        // @cuiruoni+多查两列的代价是同一行多两次字符串比较，不额外扫表；
        // @cuiruoni+而这里的代价不对称：漏删只是留个孤儿文件，误删是永久 404。
        const std::string pattern = "%" + sanitize::escape_like(name) + "%";
        auto result = sess->sql(
            "SELECT (SELECT COUNT(*) FROM posts "
            "        WHERE cover LIKE ? ESCAPE '\\\\' OR content_md LIKE ? ESCAPE '\\\\' "
            "           OR title LIKE ? ESCAPE '\\\\' OR summary LIKE ? ESCAPE '\\\\') + "
            "(SELECT COUNT(*) FROM comments WHERE content LIKE ? ESCAPE '\\\\') + "
            "(SELECT COUNT(*) FROM users WHERE avatar LIKE ? ESCAPE '\\\\')")
            .bind(pattern).bind(pattern).bind(pattern).bind(pattern)
            .bind(pattern).bind(pattern).execute();
        auto row = result.fetchOne();
        if (row.isNull()) return -1;
        return static_cast<int>(static_cast<int64_t>(row[0]));
    } catch (const std::exception& e) {
        spdlog::error("post_dao::count_image_references error: {}", e.what());
        return -1;
    }
}

json::array admin_list_posts(int page, int page_size, const std::string& status, int& total,
                             const std::string& q, const std::string& sort,
                             const std::string& order) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return json::array{};

    try {
        page = sanitize::clamp_page(page);
        page_size = sanitize::clamp_page_size(page_size);
        const std::string pattern = "%" + sanitize::escape_like(q) + "%";
        const bool has_q = !q.empty();

        std::string where = " WHERE 1=1";
        std::vector<std::string> where_binds;
        if (status != "all") {
            where += " AND p.status = ?";
            where_binds.push_back(status);
        }
        if (has_q) {
            where += " AND (p.title LIKE ? ESCAPE '\\\\' OR u.username LIKE ? ESCAPE '\\\\')";
            where_binds.push_back(pattern);
            where_binds.push_back(pattern);
        }

        std::string count_sql =
            "SELECT COUNT(*) FROM posts p LEFT JOIN users u ON p.user_id = u.id" + where;
        auto count_stmt = sess->sql(count_sql);
        for (const auto& b : where_binds) count_stmt.bind(b);
        auto count_result = count_stmt.execute();
        total = static_cast<int>(static_cast<int64_t>(count_result.fetchOne()[0]));

        static const std::unordered_map<std::string, std::string> sort_columns = {
            {"id", "p.id"},
            {"title", "p.title"},
            {"status", "p.status"},
            {"view_count", "p.view_count"},
            {"created_at", "p.created_at"},
            {"updated_at", "p.updated_at"},
            {"author", "u.username"},
        };
        std::string list_sql =
            "SELECT p.id, p.title, p.status, p.view_count, "
            "DATE_FORMAT(p.created_at, '%Y-%m-%d %H:%i:%s') AS created_at, "
            "DATE_FORMAT(p.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at, "
            "u.id, u.username "
            "FROM posts p LEFT JOIN users u ON p.user_id = u.id" + where +
            dao_utils::build_order_by(sort, order, sort_columns, "created_at") +
            " LIMIT ? OFFSET ?";

        int offset = (page - 1) * page_size;
        auto list_stmt = sess->sql(list_sql);
        for (const auto& b : where_binds) list_stmt.bind(b);
        auto result = list_stmt.bind(page_size).bind(offset).execute();

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

json::array count_monthly_published(int months) {
    // @cuiruoni+B8：先算出近 N 个月的月份标签，再把 SQL 结果填进去，保证空月份为 0
    months = sanitize::clamp_int(months, 1, 24);
    std::time_t now = std::time(nullptr);
    std::tm tm_buf{};
#ifdef _WIN32
    localtime_s(&tm_buf, &now);
#else
    localtime_r(&now, &tm_buf);
#endif
    int year = tm_buf.tm_year + 1900;
    int current_month = tm_buf.tm_mon + 1;

    std::vector<std::string> labels;
    labels.reserve(months);
    for (int i = months - 1; i >= 0; --i) {
        int y = year;
        int m = current_month - i;
        while (m <= 0) {
            m += 12;
            --y;
        }
        char buf[16];
        std::snprintf(buf, sizeof(buf), "%04d-%02d", y, m);
        labels.emplace_back(buf);
    }

    std::map<std::string, int64_t> counts;
    auto sess = MysqlPool::instance().acquire();
    if (sess) {
        try {
            std::string start = labels.front() + "-01";
            auto result = sess->sql(
                "SELECT DATE_FORMAT(created_at, '%Y-%m') AS ym, COUNT(*) "
                "FROM posts WHERE status = 'published' AND created_at >= ? "
                "GROUP BY ym").bind(start).execute();
            for (auto row : result) {
                counts[mysqlx_helper::to_string(row[0])] =
                    static_cast<int64_t>(row[1]);
            }
        } catch (const std::exception& e) {
            spdlog::error("post_dao::count_monthly_published error: {}", e.what());
        }
    }

    json::array arr;
    for (const auto& label : labels) {
        auto it = counts.find(label);
        arr.push_back(json::object{
            {"month", label},
            {"count", it != counts.end() ? it->second : 0},
        });
    }
    return arr;
}

json::array list_liked_posts(int64_t user_id, int page, int page_size, int& total) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return json::array{};
    try {
        auto count_result = sess->sql(
            "SELECT COUNT(*) FROM post_likes pl JOIN posts p ON p.id = pl.post_id "
            "WHERE pl.user_id = ? AND p.status = 'published' "
            "AND (p.visibility IN ('public','members') OR (p.visibility = 'private' AND p.user_id = ?))")
            .bind(user_id).bind(user_id).execute();
        total = static_cast<int>(static_cast<int64_t>(count_result.fetchOne()[0]));

        int offset = (page - 1) * page_size;
        std::string list_sql =
            "SELECT p.id, p.title, p.summary, p.status, p.view_count, "
            "DATE_FORMAT(p.created_at, '%Y-%m-%d %H:%i:%s') AS created_at, "
            "DATE_FORMAT(p.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at, u.username, "
            "(SELECT COUNT(*) FROM post_likes pl2 WHERE pl2.post_id = p.id) AS like_count, "
            "(SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count, "
            "p.cover, p.visibility, ";
        list_sql += kReadMinutesSql;
        list_sql += " FROM post_likes pl JOIN posts p ON p.id = pl.post_id "
                    "LEFT JOIN users u ON p.user_id = u.id "
                    "WHERE pl.user_id = ? AND p.status = 'published' "
                    "AND (p.visibility IN ('public','members') OR (p.visibility = 'private' AND p.user_id = ?)) "
                    "ORDER BY pl.created_at DESC, pl.post_id DESC LIMIT ? OFFSET ?";
        auto result = sess->sql(list_sql)
            .bind(user_id).bind(user_id).bind(page_size).bind(offset).execute();

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
            obj["cover"] = mysqlx_helper::is_null(row, 10) ? "" : mysqlx_helper::to_string(row[10]);
            obj["visibility"] = mysqlx_helper::to_string(row[11]);
            obj["read_minutes"] = mysqlx_helper::to_json(row[12]);
            arr.push_back(obj);
        }
        attach_tags(arr);
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
            "WHERE pb.user_id = ? AND p.status = 'published' "
            "AND (p.visibility IN ('public','members') OR (p.visibility = 'private' AND p.user_id = ?))")
            .bind(user_id).bind(user_id).execute();
        total = static_cast<int>(static_cast<int64_t>(count_result.fetchOne()[0]));

        int offset = (page - 1) * page_size;
        std::string list_sql =
            "SELECT p.id, p.title, p.summary, p.status, p.view_count, "
            "DATE_FORMAT(p.created_at, '%Y-%m-%d %H:%i:%s') AS created_at, "
            "DATE_FORMAT(p.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at, u.username, "
            "(SELECT COUNT(*) FROM post_likes pl2 WHERE pl2.post_id = p.id) AS like_count, "
            "(SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count, "
            "p.cover, p.visibility, ";
        list_sql += kReadMinutesSql;
        list_sql += " FROM post_bookmarks pb JOIN posts p ON p.id = pb.post_id "
                    "LEFT JOIN users u ON p.user_id = u.id "
                    "WHERE pb.user_id = ? AND p.status = 'published' "
                    "AND (p.visibility IN ('public','members') OR (p.visibility = 'private' AND p.user_id = ?)) "
                    "ORDER BY pb.created_at DESC, pb.post_id DESC LIMIT ? OFFSET ?";
        auto result = sess->sql(list_sql)
            .bind(user_id).bind(user_id).bind(page_size).bind(offset).execute();

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
            obj["cover"] = mysqlx_helper::is_null(row, 10) ? "" : mysqlx_helper::to_string(row[10]);
            obj["visibility"] = mysqlx_helper::to_string(row[11]);
            obj["read_minutes"] = mysqlx_helper::to_json(row[12]);
            arr.push_back(obj);
        }
        attach_tags(arr);
        return arr;
    } catch (const std::exception& e) {
        spdlog::error("post_dao::list_bookmarked_posts error: {}", e.what());
        return json::array{};
    }
}

}
