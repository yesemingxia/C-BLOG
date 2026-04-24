#include "db/database.h"
#include "db/mysql_pool.h"
#include "utils/logger.h"

void Database::init_tables() {
    auto sess = MysqlPool::instance().get();
    if (!sess) {
        spdlog::error("Cannot init tables: no MySQL connection");
        return;
    }

    try {
        auto db = sess->getSchema("");
        auto sess_direct = sess->sql(
            "CREATE TABLE IF NOT EXISTS users ("
            "  id BIGINT PRIMARY KEY AUTO_INCREMENT,"
            "  username VARCHAR(50) UNIQUE NOT NULL,"
            "  password_hash VARCHAR(128) NOT NULL,"
            "  salt VARCHAR(64) NOT NULL,"
            "  email VARCHAR(100),"
            "  role ENUM('admin','user') DEFAULT 'user',"
            "  created_at DATETIME DEFAULT CURRENT_TIMESTAMP"
            ")"
        );
        sess_direct.execute();

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

        sess->sql(
            "CREATE TABLE IF NOT EXISTS tags ("
            "  id INT PRIMARY KEY AUTO_INCREMENT,"
            "  name VARCHAR(50) UNIQUE NOT NULL"
            ")"
        ).execute();

        sess->sql(
            "CREATE TABLE IF NOT EXISTS post_tags ("
            "  post_id BIGINT NOT NULL,"
            "  tag_id INT NOT NULL,"
            "  PRIMARY KEY (post_id, tag_id),"
            "  FOREIGN KEY (post_id) REFERENCES posts(id),"
            "  FOREIGN KEY (tag_id) REFERENCES tags(id)"
            ")"
        ).execute();

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

        sess->sql(
            "ALTER TABLE posts ADD FULLTEXT INDEX IF NOT EXISTS ft_posts_search(title, content_md)"
        ).execute();

        spdlog::info("Database tables initialized");
    } catch (const std::exception& e) {
        spdlog::error("Database init error: {}", e.what());
    }

    MysqlPool::instance().release(sess);
}
