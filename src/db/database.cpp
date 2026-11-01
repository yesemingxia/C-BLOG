#include "db/database.h"
#include "db/mysql_pool.h"
#include "utils/logger.h"
#include "utils/mysqlx_helper.h"

#include <vector>

namespace {

// @cuiruoni+DDL 标识符引用：固定表名 + 从 information_schema 读到的约束名，
// @cuiruoni+仍然做反引号转义，避免历史库里出现奇怪约束名时拼出非法 SQL
std::string quote_ident(const std::string& name) {
    std::string out = "`";
    for (char c : name) {
        if (c == '`') out += "``";
        else out += c;
    }
    out += "`";
    return out;
}

struct ForeignKeySpec {
    const char* table;
    const char* column;
    const char* ref_table;
    const char* ref_column;
};

// @cuiruoni+B1：把建表语句里声明为 ON DELETE CASCADE、实际库却是 NO ACTION 的外键重建。
// @cuiruoni+删用户依赖 posts 级联，posts 级联又依赖 comments/post_tags 级联，缺一不可。
// @cuiruoni+B2：邮箱唯一化。唯一索引对 NULL 不冲突，但历史空串会互相冲突，
// @cuiruoni+所以先把空串统一成 NULL；重复的非空邮箱保留最早注册的账号，其余置 NULL 并告警。
// @cuiruoni+迁移可重入：唯一索引已存在时跳过建索引，去重语句本身幂等。
bool normalize_email_uniqueness(MysqlPool::PooledSession& sess) {
    auto idx_result = sess->sql(
        "SELECT COUNT(*) FROM information_schema.STATISTICS "
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' "
        "  AND COLUMN_NAME = 'email' AND NON_UNIQUE = 0").execute();
    auto idx_row = idx_result.fetchOne();
    bool has_unique = !idx_row.isNull() && static_cast<int64_t>(idx_row[0]) > 0;

    auto dup_result = sess->sql(
        "SELECT COUNT(*) FROM ("
        "  SELECT email FROM users "
        "  WHERE email IS NOT NULL AND TRIM(email) <> '' "
        "  GROUP BY email HAVING COUNT(*) > 1"
        ") AS dup").execute();
    auto dup_row = dup_result.fetchOne();
    int64_t duplicate_groups = dup_row.isNull() ? 0 : static_cast<int64_t>(dup_row[0]);

    sess->sql("UPDATE users SET email = NULL WHERE email IS NOT NULL AND TRIM(email) = ''").execute();

    if (duplicate_groups > 0) {
        sess->sql(
            "UPDATE users u "
            "JOIN ("
            "  SELECT email, MIN(id) AS keep_id FROM users "
            "  WHERE email IS NOT NULL AND TRIM(email) <> '' "
            "  GROUP BY email HAVING COUNT(*) > 1"
            ") AS d ON u.email = d.email AND u.id <> d.keep_id "
            "SET u.email = NULL").execute();
        spdlog::warn("Email uniqueness: {} duplicate email group(s) deduplicated; "
                     "later accounts now have NULL email", duplicate_groups);
    }

    if (!has_unique) {
        sess->sql("ALTER TABLE users ADD UNIQUE INDEX uq_users_email (email)").execute();
        spdlog::info("Unique index uq_users_email created on users(email)");
    }
    return true;
}

bool normalize_cascade_fks(MysqlPool::PooledSession& sess) {
    const std::vector<ForeignKeySpec> specs = {
        {"posts", "user_id", "users", "id"},
        {"comments", "post_id", "posts", "id"},
        {"comments", "parent_id", "comments", "id"},
        {"post_tags", "post_id", "posts", "id"},
        {"post_tags", "tag_id", "tags", "id"},
    };

    for (const auto& spec : specs) {
        auto result = sess->sql(
            "SELECT k.CONSTRAINT_NAME, rc.DELETE_RULE "
            "FROM information_schema.KEY_COLUMN_USAGE k "
            "JOIN information_schema.REFERENTIAL_CONSTRAINTS rc "
            "  ON rc.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA "
            " AND rc.CONSTRAINT_NAME = k.CONSTRAINT_NAME "
            " AND rc.TABLE_NAME = k.TABLE_NAME "
            "WHERE k.TABLE_SCHEMA = DATABASE() AND k.TABLE_NAME = ? "
            "  AND k.COLUMN_NAME = ? AND k.REFERENCED_TABLE_NAME = ? "
            "  AND k.REFERENCED_COLUMN_NAME = ? LIMIT 1")
            .bind(spec.table).bind(spec.column)
            .bind(spec.ref_table).bind(spec.ref_column).execute();

        auto row = result.fetchOne();
        std::string constraint_name;
        std::string delete_rule;
        if (!row.isNull()) {
            constraint_name = mysqlx_helper::to_string(row[0]);
            delete_rule = mysqlx_helper::to_string(row[1]);
        }

        if (!constraint_name.empty() && delete_rule == "CASCADE") {
            continue;
        }

        if (!constraint_name.empty()) {
            sess->sql("ALTER TABLE " + quote_ident(spec.table) +
                      " DROP FOREIGN KEY " + quote_ident(constraint_name)).execute();
        } else {
            constraint_name = std::string("fk_") + spec.table + "_" + spec.column;
        }

        sess->sql("ALTER TABLE " + quote_ident(spec.table) +
                  " ADD CONSTRAINT " + quote_ident(constraint_name) +
                  " FOREIGN KEY (" + quote_ident(spec.column) + ") REFERENCES " +
                  quote_ident(spec.ref_table) + " (" + quote_ident(spec.ref_column) +
                  ") ON DELETE CASCADE").execute();

        spdlog::info("FK cascade normalized: {}.{} -> {}.{} ({})",
                     spec.table, spec.column, spec.ref_table, spec.ref_column, constraint_name);
    }
    return true;
}

} // namespace

// @cuiruoni+初始化所有数据库表，使用CREATE IF NOT EXISTS保证幂等，可安全重复执行
void Database::init_tables() {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) {
        spdlog::error("Cannot init tables: no MySQL connection");
        return;
    }

    try {
        // @cuiruoni+用户表：存储账号信息，密码加盐哈希存储，username唯一索引
        // @cuiruoni+包含个人资料字段：bio/头像/位置/网站/twitter，updated_at用于追踪资料修改时间
        sess->sql(
            "CREATE TABLE IF NOT EXISTS users ("
            "  id BIGINT PRIMARY KEY AUTO_INCREMENT,"
            "  username VARCHAR(50) UNIQUE NOT NULL,"
            "  password_hash VARCHAR(128) NOT NULL,"
            "  salt VARCHAR(64) NOT NULL,"
            "  email VARCHAR(100),"
            "  role ENUM('admin','user') DEFAULT 'user',"
            "  bio VARCHAR(500) DEFAULT '',"
            "  avatar VARCHAR(500) DEFAULT '',"
            "  location VARCHAR(100) DEFAULT '',"
            "  website VARCHAR(200) DEFAULT '',"
            "  twitter VARCHAR(100) DEFAULT '',"
            "  background VARCHAR(512) DEFAULT '',"
            "  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,"
            "  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,"
            "  UNIQUE KEY uq_users_email (email)"
            ")"
        ).execute();

        // @cuiruoni+文章表：同时存储Markdown原文和渲染后的HTML，支持draft/published状态
        sess->sql(
            "CREATE TABLE IF NOT EXISTS posts ("
            "  id BIGINT PRIMARY KEY AUTO_INCREMENT,"
            "  title VARCHAR(200) NOT NULL,"
            "  content_md TEXT,"
            "  content_html TEXT,"
            "  summary VARCHAR(500),"
            "  cover VARCHAR(500) NOT NULL DEFAULT '',"
            "  visibility ENUM('public','members','private') NOT NULL DEFAULT 'public',"
            "  user_id BIGINT NOT NULL,"
            "  status ENUM('draft','published') DEFAULT 'draft',"
            "  view_count INT DEFAULT 0,"
            "  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,"
            "  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,"
            "  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE"
            ")"
        ).execute();

        // @cuiruoni+标签表：独立管理标签，name唯一
        sess->sql(
            "CREATE TABLE IF NOT EXISTS tags ("
            "  id INT PRIMARY KEY AUTO_INCREMENT,"
            "  name VARCHAR(50) UNIQUE NOT NULL"
            ")"
        ).execute();

        // @cuiruoni+文章-标签关联表：多对多关系，联合主键防止重复关联
        sess->sql(
            "CREATE TABLE IF NOT EXISTS post_tags ("
            "  post_id BIGINT NOT NULL,"
            "  tag_id INT NOT NULL,"
            "  PRIMARY KEY (post_id, tag_id),"
            "  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,"
            "  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE"
            ")"
        ).execute();

        // @cuiruoni+评论表：支持嵌套评论，parent_id为空表示顶级评论，非空表示回复
        sess->sql(
            "CREATE TABLE IF NOT EXISTS comments ("
            "  id BIGINT PRIMARY KEY AUTO_INCREMENT,"
            "  post_id BIGINT NOT NULL,"
            "  author_name VARCHAR(50) NOT NULL,"
            "  author_email VARCHAR(100),"
            "  content TEXT NOT NULL,"
            "  parent_id BIGINT,"
            "  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,"
            "  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,"
            "  FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE CASCADE"
            ")"
        ).execute();

        // @cuiruoni+通知表：存储用户通知，支持like/comment/follow/system/mention类型
        sess->sql(
            "CREATE TABLE IF NOT EXISTS notifications ("
            "  id BIGINT PRIMARY KEY AUTO_INCREMENT,"
            "  user_id BIGINT NOT NULL,"
            "  type ENUM('like','comment','follow','system','mention') NOT NULL,"
            "  actor_name VARCHAR(50),"
            "  actor_id BIGINT NULL,"
            "  post_id BIGINT NULL,"
            "  content VARCHAR(500) NOT NULL,"
            "  post_title VARCHAR(200),"
            "  is_read TINYINT(1) DEFAULT 0,"
            "  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,"
            "  INDEX idx_notifications_user_id(user_id),"
            "  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE"
            ")"
        ).execute();

        // @cuiruoni+联系消息表：存储用户通过联系表单发送的消息
        sess->sql(
            "CREATE TABLE IF NOT EXISTS contact_messages ("
            "  id BIGINT PRIMARY KEY AUTO_INCREMENT,"
            "  name VARCHAR(100) NOT NULL,"
            "  email VARCHAR(100) NOT NULL,"
            "  message TEXT NOT NULL,"
            "  created_at DATETIME DEFAULT CURRENT_TIMESTAMP"
            ")"
        ).execute();

        // @cuiruoni+视频投稿表：用户上传的背景视频，审核通过后由管理员「启用」唯一一支作为主页背景
        sess->sql(
            "CREATE TABLE IF NOT EXISTS video_submissions ("
            "  id BIGINT PRIMARY KEY AUTO_INCREMENT,"
            "  uploader_id BIGINT NOT NULL,"
            "  filename VARCHAR(255) NOT NULL,"
            "  original_name VARCHAR(255),"
            "  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',"
            "  is_active TINYINT(1) NOT NULL DEFAULT 0,"
            "  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,"
            "  reviewed_at DATETIME NULL,"
            "  INDEX idx_video_status(status),"
            "  FOREIGN KEY (uploader_id) REFERENCES users(id) ON DELETE CASCADE"
            ")"
        ).execute();

        // @cuiruoni+A5：中文全文检索必须用 ngram parser（默认 parser 会把无空格中文当整段 token）。
        // @cuiruoni+先建 ngram 索引，旧库的默认 parser 索引由迁移 13/14 清理，避免先删后建造成搜索空窗。
        try {
            sess->sql("CREATE FULLTEXT INDEX IF NOT EXISTS ft_posts_search_ngram "
                      "ON posts(title, content_md) WITH PARSER ngram").execute();
            spdlog::info("Fulltext ngram index ensured on posts(title, content_md)");
        } catch (const std::exception& e) {
            spdlog::debug("Fulltext ngram index may already exist or parser unavailable: {}", e.what());
        }

        // @cuiruoni+P1修复：版本化迁移机制。schema_migrations 表记录已应用版本，
        // 新增列/表统一通过迁移演进，替代原先"直接ALTER+忽略错误"的临时方案
        sess->sql(
            "CREATE TABLE IF NOT EXISTS schema_migrations ("
            "  version INT PRIMARY KEY,"
            "  name VARCHAR(200) NOT NULL,"
            "  applied_at DATETIME DEFAULT CURRENT_TIMESTAMP"
            ")"
        ).execute();

        struct Migration {
            int version;
            std::string name;
            std::string sql;
        };
        const std::vector<Migration> migrations = {
            {1, "add_users_bio", "ALTER TABLE users ADD COLUMN bio VARCHAR(500) DEFAULT ''"},
            {2, "add_users_avatar", "ALTER TABLE users ADD COLUMN avatar VARCHAR(500) DEFAULT ''"},
            {3, "add_users_location", "ALTER TABLE users ADD COLUMN location VARCHAR(100) DEFAULT ''"},
            {4, "add_users_website", "ALTER TABLE users ADD COLUMN website VARCHAR(200) DEFAULT ''"},
            {5, "add_users_twitter", "ALTER TABLE users ADD COLUMN twitter VARCHAR(100) DEFAULT ''"},
            {6, "add_users_updated_at", "ALTER TABLE users ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"},
            {7, "create_post_likes",
             "CREATE TABLE IF NOT EXISTS post_likes ("
             " user_id BIGINT NOT NULL, post_id BIGINT NOT NULL,"
             " created_at DATETIME DEFAULT CURRENT_TIMESTAMP,"
             " PRIMARY KEY (user_id, post_id),"
             " FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,"
             " FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE)"},
            {8, "create_post_bookmarks",
             "CREATE TABLE IF NOT EXISTS post_bookmarks ("
             " user_id BIGINT NOT NULL, post_id BIGINT NOT NULL,"
             " created_at DATETIME DEFAULT CURRENT_TIMESTAMP,"
             " PRIMARY KEY (user_id, post_id),"
             " FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,"
             " FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE)"},
            {9, "create_follows",
             "CREATE TABLE IF NOT EXISTS follows ("
             " follower_id BIGINT NOT NULL, followee_id BIGINT NOT NULL,"
             " created_at DATETIME DEFAULT CURRENT_TIMESTAMP,"
             " PRIMARY KEY (follower_id, followee_id),"
             " FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,"
             " FOREIGN KEY (followee_id) REFERENCES users(id) ON DELETE CASCADE)"},
            {10, "add_users_background", "ALTER TABLE users ADD COLUMN background VARCHAR(512) DEFAULT ''"},
            {11, "add_posts_cover", "ALTER TABLE posts ADD COLUMN cover VARCHAR(500) NOT NULL DEFAULT ''"},
            {12, "add_posts_visibility",
             "ALTER TABLE posts ADD COLUMN visibility ENUM('public','members','private') NOT NULL DEFAULT 'public'"},
            {13, "create_fulltext_ngram",
             "CREATE FULLTEXT INDEX ft_posts_search_ngram ON posts(title, content_md) WITH PARSER ngram"},
            {14, "drop_legacy_fulltext", "ALTER TABLE posts DROP INDEX ft_posts_search"},
            // @cuiruoni+B1：空 SQL，实际逻辑走 normalize_cascade_fks（需要先查真实外键名）
            {15, "normalize_cascade_fks", ""},
            // @cuiruoni+B2：先清空串/重复邮箱，再加唯一索引（需要查询 information_schema）
            {16, "normalize_email_uniqueness", ""},
            // @cuiruoni+B12：通知可跳转到文章/用户，拆成两条保证单列失败可重试
            {17, "add_notifications_post_id", "ALTER TABLE notifications ADD COLUMN post_id BIGINT NULL"},
            {18, "add_notifications_actor_id", "ALTER TABLE notifications ADD COLUMN actor_id BIGINT NULL"},
        };

        for (const auto& m : migrations) {
            auto applied = sess->sql("SELECT COUNT(*) FROM schema_migrations WHERE version = ?")
                .bind(m.version).execute();
            auto row = applied.fetchOne();
            bool done = !row.isNull() && static_cast<int64_t>(row[0]) > 0;
            if (done) continue;

            // @cuiruoni+A5：只有 ngram 索引确实存在时才允许删除旧索引，
            // @cuiruoni+避免 ngram 创建失败（parser 不可用）时把唯一可用的旧索引删掉
            if (m.version == 14) {
                try {
                    auto idx = sess->sql(
                        "SELECT COUNT(*) FROM information_schema.statistics "
                        "WHERE table_schema = DATABASE() AND table_name = 'posts' "
                        "AND index_name = 'ft_posts_search_ngram'").execute();
                    auto idx_row = idx.fetchOne();
                    int64_t idx_count = idx_row.isNull() ? 0 : static_cast<int64_t>(idx_row[0]);
                    if (idx_count == 0) {
                        spdlog::error("Skip migration {} ({}): ngram index missing, keep legacy index",
                                      m.version, m.name);
                        continue;
                    }
                } catch (const std::exception& e) {
                    spdlog::error("Skip migration {} ({}): index check failed: {}",
                                  m.version, m.name, e.what());
                    continue;
                }
            }

            bool applied_ok = false;
            try {
                // @cuiruoni+B1：外键名因库而异，不能用一段静态 SQL 完成，单独走 C++ 迁移
                if (m.version == 15) {
                    applied_ok = normalize_cascade_fks(sess);
                    if (applied_ok) spdlog::info("Migration {} applied: {}", m.version, m.name);
                } else if (m.version == 16) {
                    applied_ok = normalize_email_uniqueness(sess);
                    if (applied_ok) spdlog::info("Migration {} applied: {}", m.version, m.name);
                } else {
                    sess->sql(m.sql).execute();
                    spdlog::info("Migration {} applied: {}", m.version, m.name);
                    applied_ok = true;
                }
            } catch (const std::exception& e) {
                // @cuiruoni+列/表已存在视为幂等跳过（历史库手工执行过 DDL 的场景），
                // @cuiruoni+其余真实错误（权限/磁盘/引擎）不得标记已应用，下次启动重试
                std::string err = e.what();
                bool idempotent = err.find("Duplicate column name") != std::string::npos ||
                                  err.find("already exists") != std::string::npos ||
                                  err.find("Duplicate entry") != std::string::npos ||
                                  err.find("Duplicate key name") != std::string::npos ||
                                  err.find("Can't DROP") != std::string::npos ||
                                  err.find("check that column/key exists") != std::string::npos;
                if (idempotent) {
                    spdlog::debug("Migration {} idempotent skip ({}): {}", m.version, m.name, err);
                    applied_ok = true;
                } else {
                    spdlog::error("Migration {} FAILED ({}): {}", m.version, m.name, err);
                }
            }
            if (applied_ok) {
                try {
                    sess->sql("INSERT INTO schema_migrations (version, name) VALUES (?, ?)")
                        .bind(m.version).bind(m.name).execute();
                } catch (const std::exception& e) {
                    spdlog::error("Migration {} record failed: {}", m.version, e.what());
                }
            }
        }

        spdlog::info("Database tables initialized ({} migrations checked)", migrations.size());
    } catch (const std::exception& e) {
        spdlog::error("Database init error: {}", e.what());
    }
}
