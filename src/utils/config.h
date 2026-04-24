#pragma once

#include <boost/json.hpp>
#include <string>

namespace json = boost::json;

class Config {
public:
    static Config& instance();

    void load(const std::string& path);

    const json::object& data() const;

    std::string get_string(const std::string& key, const std::string& default_val = "") const;
    int get_int(const std::string& key, int default_val = 0) const;
    bool get_bool(const std::string& key, bool default_val = false) const;

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
    std::string log_level() const;
    std::string log_file() const;

private:
    Config() = default;
    json::object data_;
};
