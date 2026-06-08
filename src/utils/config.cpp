#include "utils/config.h"

#include <boost/json.hpp>
#include <fstream>
#include <sstream>
#include <stdexcept>

namespace json = boost::json;

Config& Config::instance() {
    // @cuiruoni+局部静态变量实现线程安全的懒汉单例
    static Config cfg;
    return cfg;
}

void Config::load(const std::string& path) {
    // @cuiruoni+读取JSON配置文件，文件不存在或格式错误时抛出异常终止启动
    std::ifstream ifs(path);
    if (!ifs.is_open()) {
        throw std::runtime_error("Cannot open config file: " + path);
    }
    std::stringstream ss;
    ss << ifs.rdbuf();
    std::string content = ss.str();

    json::value v = json::parse(content);
    if (!v.is_object()) {
        throw std::runtime_error("Config root must be a JSON object");
    }
    data_ = v.as_object();

    const std::string secret = get_string("jwt_secret", "");
    if (secret.empty() || secret == "cpp-blog-secret-key") {
        throw std::runtime_error("jwt_secret must be configured and must not use the default value");
    }
}

const json::object& Config::data() const {
    return data_;
}

std::string Config::get_string(const std::string& key, const std::string& default_val) const {
    auto it = data_.find(key);
    if (it != data_.end() && it->value().is_string()) {
        return std::string(it->value().as_string());
    }
    return default_val;
}

int Config::get_int(const std::string& key, int default_val) const {
    auto it = data_.find(key);
    if (it != data_.end() && it->value().is_int64()) {
        return static_cast<int>(it->value().as_int64());
    }
    return default_val;
}

bool Config::get_bool(const std::string& key, bool default_val) const {
    auto it = data_.find(key);
    if (it != data_.end() && it->value().is_bool()) {
        return it->value().as_bool();
    }
    return default_val;
}

std::string Config::server_host() const { return get_string("server_host", "0.0.0.0"); }
int Config::server_port() const { return get_int("server_port", 8088); }
std::string Config::db_host() const { return get_string("db_host", "127.0.0.1"); }
int Config::db_port() const { return get_int("db_port", 33060); } // @cuiruoni+MySQL X DevAPI默认端口
std::string Config::db_user() const { return get_string("db_user", "root"); }
std::string Config::db_password() const { return get_string("db_password", ""); }
std::string Config::db_name() const { return get_string("db_name", "blog"); }
int Config::db_pool_size() const { return get_int("db_pool_size", 4); }
std::string Config::redis_host() const { return get_string("redis_host", "127.0.0.1"); }
int Config::redis_port() const { return get_int("redis_port", 6379); }
std::string Config::redis_password() const { return get_string("redis_password", ""); }
int Config::redis_pool_size() const { return get_int("redis_pool_size", 4); }
std::string Config::jwt_secret() const { return get_string("jwt_secret", ""); }
int Config::jwt_expire_seconds() const { return get_int("jwt_expire_seconds", 86400); } // @cuiruoni+默认24小时
std::string Config::cors_allowed_origin() const { return get_string("cors_allowed_origin", "http://localhost:5173"); }
int Config::max_request_body_bytes() const { return get_int("max_request_body_bytes", 1048576); }
int Config::server_threads() const { return get_int("server_threads", 0); }
std::string Config::log_level() const { return get_string("log_level", "info"); }
std::string Config::log_file() const { return get_string("log_file", ""); }
