#pragma once

#include <boost/json.hpp>
#include <string>

namespace json = boost::json;

// @cuiruoni+配置管理类，单例模式，从JSON配置文件加载所有运行参数
// @cuiruoni+提供类型安全的getter方法，支持默认值回退
class Config {
public:
    static Config& instance();

    // @cuiruoni+加载JSON配置文件，解析失败抛出异常
    void load(const std::string& path);

    const json::object& data() const;

    // @cuiruoni+通用类型安全getter，键不存在或类型不匹配时返回默认值
    std::string get_string(const std::string& key, const std::string& default_val = "") const;
    int get_int(const std::string& key, int default_val = 0) const;
    bool get_bool(const std::string& key, bool default_val = false) const;

    // @cuiruoni+各配置项的便捷访问方法，均提供合理默认值
    std::string server_host() const;
    int server_port() const;
    std::string db_host() const;
    int db_port() const;
    std::string db_user() const;
    std::string db_password() const;
    std::string db_name() const;
    int db_pool_size() const;
    std::string redis_host() const;
    int redis_port() const;
    std::string redis_password() const;
    int redis_pool_size() const;
    std::string jwt_secret() const;
    int jwt_expire_seconds() const;
    std::string cors_allowed_origin() const;
    int max_request_body_bytes() const;
    int server_threads() const;
    std::string log_level() const;
    std::string log_file() const;

private:
    Config() = default;
    json::object data_; // @cuiruoni+配置数据，JSON对象格式
};
