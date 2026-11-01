#include "utils/config.h"

#include <boost/json.hpp>
#include <algorithm>
#include <cctype>
#include <cstdlib>
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

    // @cuiruoni+P0修复：支持环境变量覆盖配置文件（Docker Compose 部署必需，
    // 否则容器内 DB_HOST/DB_PORT 等环境变量会被忽略）
    auto has_env = [](const char* name) {
        const char* v = std::getenv(name);
        return v != nullptr && *v != '\0';
    };
    auto override_str = [&](const char* env_name, const char* key) {
        if (has_env(env_name)) {
            data_[key] = std::string(std::getenv(env_name));
        }
    };
    auto override_int = [&](const char* env_name, const char* key) {
        if (has_env(env_name)) {
            try {
                data_[key] = std::stoi(std::getenv(env_name));
            } catch (...) {
                // @cuiruoni+非法整数值忽略，保留配置文件中的值
            }
        }
    };

    override_str("DB_HOST", "db_host");
    override_int("DB_PORT", "db_port");
    override_str("DB_USER", "db_user");
    override_str("DB_PASSWORD", "db_password");
    override_str("DB_NAME", "db_name");
    override_str("REDIS_HOST", "redis_host");
    override_int("REDIS_PORT", "redis_port");
    override_str("REDIS_PASSWORD", "redis_password");
    override_str("JWT_SECRET", "jwt_secret");
    override_int("JWT_EXPIRE_SECONDS", "jwt_expire_seconds");
    override_str("CORS_ALLOWED_ORIGIN", "cors_allowed_origin");
    // @cuiruoni+B14：CORS_ALLOWED_ORIGINS=a,b,c 覆盖为数组
    if (has_env("CORS_ALLOWED_ORIGINS")) {
        json::array origins;
        std::string raw = std::getenv("CORS_ALLOWED_ORIGINS");
        std::stringstream ss(raw);
        std::string item;
        while (std::getline(ss, item, ',')) {
            auto begin = item.find_first_not_of(" \t");
            auto end = item.find_last_not_of(" \t");
            if (begin != std::string::npos) {
                origins.push_back(json::value(item.substr(begin, end - begin + 1)));
            }
        }
        data_["cors_allowed_origins"] = std::move(origins);
    }
    override_int("SERVER_PORT", "server_port");
    override_str("LOG_LEVEL", "log_level");
    // @cuiruoni+安全：只有确认后端只被可信代理访问时，才允许用 TRUST_PROXY_REAL_IP 打开
    // @cuiruoni+对 X-Real-IP 的认账；不开就只认 TCP 对端地址。
    if (has_env("TRUST_PROXY_REAL_IP")) {
        std::string raw = std::getenv("TRUST_PROXY_REAL_IP");
        std::transform(raw.begin(), raw.end(), raw.begin(),
                       [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
        data_["trust_proxy_real_ip"] = (raw == "1" || raw == "true" || raw == "yes" || raw == "on");
    }

    const std::string secret = get_string("jwt_secret", "");
    // @cuiruoni+原来只拦「空」和 cpp-blog-secret-key 这一个值。config.local.json 里带的
    // @cuiruoni+change-me-to-a-random-secret-… 能照常启动，而它是写在仓库里的公开字符串 ——
    // @cuiruoni+HS256 是对称密钥，密钥一旦公开，任何人都能自己签一个 role=admin、user_id=1 的
    // @cuiruoni+token 直接进后台，验签是过的。这类占位值一律拒绝启动。
    std::string lowered = secret;
    std::transform(lowered.begin(), lowered.end(), lowered.begin(),
                   [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
    // @cuiruoni+32 位是「不能用字典猜」的下限；占位串往往够长但内容是公开的，所以两个条件独立判。
    bool unacceptable = secret.size() < 32;
    static constexpr const char* kPlaceholderMarks[] = {
        "change-me", "change_me", "changeme", "your-secret", "your_secret",
        "placeholder", "example", "secret-key", "todo", "xxxxxx",
    };
    for (const char* mark : kPlaceholderMarks) {
        if (lowered.find(mark) != std::string::npos) {
            unacceptable = true;
            break;
        }
    }
    if (unacceptable) {
        throw std::runtime_error(
            "jwt_secret must be a private random string of at least 32 characters "
            "(generate one, e.g. `openssl rand -hex 32`, or set the JWT_SECRET environment variable). "
            "Placeholder or short values are refused: with a known HS256 key anyone can forge an admin token.");
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
int Config::server_port() const { return get_int("server_port", 8089); }
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
int Config::jwt_expire_seconds() const { return get_int("jwt_expire_seconds", 14400); } // @cuiruoni+默认4小时，生产环境建议缩短
std::string Config::cors_allowed_origin() const { return get_string("cors_allowed_origin", "http://localhost:5173"); }
std::vector<std::string> Config::cors_allowed_origins() const {
    std::vector<std::string> origins;
    auto it = data_.find("cors_allowed_origins");
    if (it != data_.end() && it->value().is_array()) {
        for (const auto& value : it->value().as_array()) {
            if (value.is_string()) origins.emplace_back(value.as_string().c_str());
        }
    }
    if (origins.empty()) {
        std::string single = get_string("cors_allowed_origin", "http://localhost:5173");
        if (!single.empty()) origins.push_back(std::move(single));
    }
    return origins;
}
// @cuiruoni+安全：默认不相信请求头里的 X-Real-IP，只认 TCP 对端（见 utils/client_ip.h）
bool Config::trust_proxy_real_ip() const { return get_bool("trust_proxy_real_ip", false); }
int Config::server_threads() const { return get_int("server_threads", 0); }
std::string Config::log_level() const { return get_string("log_level", "info"); }
std::string Config::log_file() const { return get_string("log_file", ""); }
// @cuiruoni+默认 "uploads"：相对值由 storage::derive_root 钉到项目根，不是进程 cwd
std::string Config::storage_root() const { return get_string("storage_root", "uploads"); }
