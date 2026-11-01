#pragma once

#include <boost/json.hpp>
#include <string>
#include <vector>

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
    // @cuiruoni+B14：优先读数组 cors_allowed_origins，回退单值 cors_allowed_origin
    std::vector<std::string> cors_allowed_origins() const;
    // @cuiruoni+安全：是否相信 X-Real-IP 请求头。默认 false —— 只有后端不直接对外、
    // @cuiruoni+且代理会用 $remote_addr 覆写该头时才开；开了以后限流/浏览量去重才按头里的 IP 计。
    bool trust_proxy_real_ip() const;
    int server_threads() const;
    std::string log_level() const;
    std::string log_file() const;
    // @cuiruoni+落盘资源根目录（图片/视频/分片）。相对值按「配置文件所属项目根」解析，
    // @cuiruoni+不再随进程工作目录漂移 —— 详见 utils/storage.h
    std::string storage_root() const;

private:
    Config() = default;
    json::object data_; // @cuiruoni+配置数据，JSON对象格式
};
