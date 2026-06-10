#include "dao/user_dao.h"
#include "db/mysql_pool.h"
#include "utils/logger.h"
#include "utils/mysqlx_helper.h"

namespace user_dao {

int64_t count_by_username(const std::string& username) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return 0;

    try {
        auto result = sess->sql("SELECT COUNT(*) FROM users WHERE username = ?")
            .bind(username).execute();
        return static_cast<int64_t>(result.fetchOne()[0]);
    } catch (const std::exception& e) {
        spdlog::error("user_dao::count_by_username error: {}", e.what());
        return 0;
    }
}

int64_t insert(const std::string& username, const std::string& password_hash,
               const std::string& salt, const std::string& email) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return 0;

    try {
        sess->sql("INSERT INTO users (username, password_hash, salt, email) VALUES (?, ?, ?, ?)")
            .bind(username)
            .bind(password_hash)
            .bind(salt)
            .bind(email)
            .execute();

        auto result = sess->sql("SELECT LAST_INSERT_ID()").execute();
        return static_cast<int64_t>(result.fetchOne()[0]);
    } catch (const std::exception& e) {
        spdlog::error("user_dao::insert error: {}", e.what());
        return 0;
    }
}

bool find_by_username_or_email(const std::string& username,
                               int64_t& id, std::string& db_username,
                               std::string& password_hash, std::string& salt,
                               std::string& role, std::string& email) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return false;

    try {
        auto result = sess->sql(
            "SELECT id, username, password_hash, salt, role, email FROM users WHERE username = ? OR email = ?")
            .bind(username).bind(username).execute();

        auto row = result.fetchOne();
        if (row.isNull()) return false;

        id = static_cast<int64_t>(row[0]);
        db_username = static_cast<std::string>(row[1]);
        password_hash = static_cast<std::string>(row[2]);
        salt = static_cast<std::string>(row[3]);
        role = static_cast<std::string>(row[4]);
        email = row[5].isNull() ? "" : static_cast<std::string>(row[5]);
        return true;
    } catch (const std::exception& e) {
        spdlog::error("user_dao::find_by_username_or_email error: {}", e.what());
        return false;
    }
}

json::object find_profile_by_id(int64_t user_id) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return json::object{};

    try {
        auto result = sess->sql(
            "SELECT id, username, email, role, bio, avatar, location, website, twitter, created_at "
            "FROM users WHERE id = ?")
            .bind(user_id).execute();
        auto row = result.fetchOne();
        if (row.isNull()) return json::object{};

        json::object data;
        data["id"] = static_cast<int64_t>(row[0]);
        data["username"] = static_cast<std::string>(row[1]);
        data["email"] = row[2].isNull() ? "" : static_cast<std::string>(row[2]);
        data["role"] = static_cast<std::string>(row[3]);
        data["bio"] = row[4].isNull() ? "" : static_cast<std::string>(row[4]);
        data["avatar"] = row[5].isNull() ? "" : static_cast<std::string>(row[5]);
        data["location"] = row[6].isNull() ? "" : static_cast<std::string>(row[6]);
        data["website"] = row[7].isNull() ? "" : static_cast<std::string>(row[7]);
        data["twitter"] = row[8].isNull() ? "" : static_cast<std::string>(row[8]);
        data["created_at"] = static_cast<std::string>(row[9]);
        return data;
    } catch (const std::exception& e) {
        spdlog::error("user_dao::find_profile_by_id error: {}", e.what());
        return json::object{};
    }
}

bool update_profile(int64_t user_id, const std::string& email,
                    const std::string& bio, const std::string& avatar,
                    const std::string& location, const std::string& website,
                    const std::string& twitter) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return false;

    try {
        sess->sql(
            "UPDATE users SET email = ?, bio = ?, avatar = ?, location = ?, website = ?, twitter = ? "
            "WHERE id = ?")
            .bind(email).bind(bio).bind(avatar).bind(location).bind(website).bind(twitter)
            .bind(user_id).execute();
        return true;
    } catch (const std::exception& e) {
        spdlog::error("user_dao::update_profile error: {}", e.what());
        return false;
    }
}

bool find_password_by_id(int64_t user_id, std::string& password_hash, std::string& salt) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return false;

    try {
        auto result = sess->sql("SELECT password_hash, salt FROM users WHERE id = ?")
            .bind(user_id).execute();
        auto row = result.fetchOne();
        if (row.isNull()) return false;

        password_hash = static_cast<std::string>(row[0]);
        salt = static_cast<std::string>(row[1]);
        return true;
    } catch (const std::exception& e) {
        spdlog::error("user_dao::find_password_by_id error: {}", e.what());
        return false;
    }
}

bool update_password(int64_t user_id, const std::string& new_hash_b64, const std::string& new_salt_b64) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return false;

    try {
        sess->sql("UPDATE users SET password_hash = ?, salt = ?, updated_at = NOW() WHERE id = ?")
            .bind(new_hash_b64).bind(new_salt_b64).bind(user_id).execute();
        return true;
    } catch (const std::exception& e) {
        spdlog::error("user_dao::update_password error: {}", e.what());
        return false;
    }
}

json::object find_public_profile_by_username(const std::string& username) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return json::object{};

    try {
        auto user_result = sess->sql(
            "SELECT id, username, bio, avatar, location, website, twitter, created_at "
            "FROM users WHERE username = ?")
            .bind(username).execute();
        auto user_row = user_result.fetchOne();
        if (user_row.isNull()) return json::object{};

        int64_t uid = static_cast<int64_t>(user_row[0]);
        json::object profile;
        profile["id"] = uid;
        profile["username"] = static_cast<std::string>(user_row[1]);
        profile["bio"] = user_row[2].isNull() ? "" : static_cast<std::string>(user_row[2]);
        profile["avatar"] = user_row[3].isNull() ? "" : static_cast<std::string>(user_row[3]);
        profile["location"] = user_row[4].isNull() ? "" : static_cast<std::string>(user_row[4]);
        profile["website"] = user_row[5].isNull() ? "" : static_cast<std::string>(user_row[5]);
        profile["twitter"] = user_row[6].isNull() ? "" : static_cast<std::string>(user_row[6]);
        profile["created_at"] = static_cast<std::string>(user_row[7]);

        auto posts_result = sess->sql(
            "SELECT id, title, summary, status, view_count, created_at "
            "FROM posts WHERE user_id = ? ORDER BY created_at DESC")
            .bind(uid).execute();

        json::array posts_arr;
        for (auto row = posts_result.begin(); row != posts_result.end(); ++row) {
            json::object post_obj;
            post_obj["id"] = static_cast<int64_t>((*row)[0]);
            post_obj["title"] = static_cast<std::string>((*row)[1]);
            post_obj["summary"] = (*row)[2].isNull() ? "" : static_cast<std::string>((*row)[2]);
            post_obj["status"] = static_cast<std::string>((*row)[3]);
            post_obj["view_count"] = static_cast<int64_t>((*row)[4]);
            post_obj["created_at"] = static_cast<std::string>((*row)[5]);
            post_obj["author"] = username;
            posts_arr.push_back(post_obj);
        }
        profile["posts"] = posts_arr;

        return profile;
    } catch (const std::exception& e) {
        spdlog::error("user_dao::find_public_profile_by_username error: {}", e.what());
        return json::object{};
    }
}

int64_t count_all() {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return 0;

    try {
        auto result = sess->sql("SELECT COUNT(*) FROM users").execute();
        return static_cast<int64_t>(result.fetchOne()[0]);
    } catch (const std::exception& e) {
        spdlog::error("user_dao::count_all error: {}", e.what());
        return 0;
    }
}

json::array list_users(int page, int page_size, int& total) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return json::array{};

    try {
        auto count_result = sess->sql("SELECT COUNT(*) FROM users").execute();
        total = static_cast<int>(static_cast<int64_t>(count_result.fetchOne()[0]));

        int offset = (page - 1) * page_size;
        auto result = sess->sql(
            "SELECT id, username, email, role, created_at FROM users "
            "ORDER BY created_at DESC LIMIT ? OFFSET ?")
            .bind(page_size).bind(offset).execute();

        json::array arr;
        for (auto row : result) {
            json::object obj;
            obj["id"] = mysqlx_helper::to_json(row[0]);
            obj["username"] = mysqlx_helper::to_string(row[1]);
            obj["email"] = mysqlx_helper::is_null(row, 2) ? "" : mysqlx_helper::to_string(row[2]);
            obj["role"] = mysqlx_helper::to_string(row[3]);
            obj["created_at"] = mysqlx_helper::to_string(row[4]);
            arr.push_back(obj);
        }
        return arr;
    } catch (const std::exception& e) {
        spdlog::error("user_dao::list_users error: {}", e.what());
        return json::array{};
    }
}

bool exists_by_id(int64_t user_id) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return false;

    try {
        auto check = sess->sql("SELECT id FROM users WHERE id = ?").bind(user_id).execute();
        return check.count() > 0;
    } catch (const std::exception& e) {
        spdlog::error("user_dao::exists_by_id error: {}", e.what());
        return false;
    }
}

bool update_role(int64_t user_id, const std::string& new_role) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return false;

    try {
        sess->sql("UPDATE users SET role = ? WHERE id = ?").bind(new_role).bind(user_id).execute();
        return true;
    } catch (const std::exception& e) {
        spdlog::error("user_dao::update_role error: {}", e.what());
        return false;
    }
}

bool delete_by_id(int64_t user_id) {
    auto sess = MysqlPool::instance().acquire();
    if (!sess) return false;

    try {
        sess->sql("DELETE FROM users WHERE id = ?").bind(user_id).execute();
        return true;
    } catch (const std::exception& e) {
        spdlog::error("user_dao::delete_by_id error: {}", e.what());
        return false;
    }
}

}
