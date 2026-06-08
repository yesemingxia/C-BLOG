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
            "  FOREIGN KEY (user_id) REFERENCES users(id)"
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
            "  FOREIGN KEY (post_id) REFERENCES posts(id),"
            "  FOREIGN KEY (tag_id) REFERENCES tags(id)"
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
            "  FOREIGN KEY (post_id) REFERENCES posts(id),"
            "  FOREIGN KEY (parent_id) REFERENCES comments(id)"
            ")"
        ).execute();

        // @cuiruoni+数据库迁移：为已有users表添加新字段（CREATE IF NOT EXISTS不会添加新列）
        // @cuiruoni+使用存储过程安全添加列，列已存在时跳过
        auto add_column_if_not_exists = [&](const std::string& table, const std::string& column, const std::string& definition) {
            try {
                sess->sql(
                    "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS "
                    "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '" + table + "' AND COLUMN_NAME = '" + column + "'"
                ).execute();
                // @cuiruoni+简化方案：直接尝试ALTER TABLE，列已存在时忽略错误
            } catch (...) {}
            try {
                sess->sql("ALTER TABLE " + table + " ADD COLUMN " + column + " " + definition).execute();
                spdlog::info("Migration: added column {}.{}", table, column);
            } catch (const std::exception& e) {
                // @cuiruoni+列已存在时会报Duplicate column错误，安全忽略
                spdlog::debug("Migration skipped {}.{}: {}", table, column, e.what());
            }
        };

        add_column_if_not_exists("users", "bio", "VARCHAR(500) DEFAULT ''");
        add_column_if_not_exists("users", "avatar", "VARCHAR(500) DEFAULT ''");
        add_column_if_not_exists("users", "location", "VARCHAR(100) DEFAULT ''");
        add_column_if_not_exists("users", "website", "VARCHAR(200) DEFAULT ''");
        add_column_if_not_exists("users", "twitter", "VARCHAR(100) DEFAULT ''");
        add_column_if_not_exists("users", "updated_at", "DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");

        spdlog::info("Database tables initialized");
    } catch (const std::exception& e) {
        spdlog::error("Database init error: {}", e.what());
    }
}
