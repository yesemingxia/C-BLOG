#include "db/database.h"
#include "db/mysql_pool.h"
#include "utils/logger.h"

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
            "  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"
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

        // @cuiruoni+创建全文索引，搜索服务依赖此索引，IF NOT EXISTS保证幂等
        try {
            sess->sql("CREATE FULLTEXT INDEX IF NOT EXISTS ft_posts_search ON posts(title, content_md)").execute();
            spdlog::info("Fulltext index ensured on posts(title, content_md)");
        } catch (const std::exception& e) {
            spdlog::debug("Fulltext index may already exist: {}", e.what());
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
        };

        for (const auto& m : migrations) {
            auto applied = sess->sql("SELECT COUNT(*) FROM schema_migrations WHERE version = ?")
                .bind(m.version).execute();
            auto row = applied.fetchOne();
            bool done = !row.isNull() && static_cast<int64_t>(row[0]) > 0;
            if (done) continue;

            bool applied_ok = false;
            try {
                sess->sql(m.sql).execute();
                spdlog::info("Migration {} applied: {}", m.version, m.name);
                applied_ok = true;
            } catch (const std::exception& e) {
                // @cuiruoni+列/表已存在视为幂等跳过（历史库手工执行过 DDL 的场景），
                // @cuiruoni+其余真实错误（权限/磁盘/引擎）不得标记已应用，下次启动重试
                std::string err = e.what();
                bool idempotent = err.find("Duplicate column name") != std::string::npos ||
                                  err.find("already exists") != std::string::npos ||
                                  err.find("Duplicate entry") != std::string::npos;
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
