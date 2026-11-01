#include "services/auth_service.h"

#include "utils/config.h"
#include "utils/logger.h"
#include "db/redis_pool.h"

#include <jwt-cpp/traits/boost-json/traits.h>

#include <chrono>
#include <random>
#include <string>

namespace auth_service {

// @cuiruoni+P2修复：优先读Authorization: Bearer，其次读HttpOnly Cookie中的blog_token
std::string extract_token_from_request(const http::request<http::string_body>& req) {
    auto auth = req.find(http::field::authorization);
    if (auth != req.end()) {
        std::string value(auth->value());
        if (value.size() > 7 && value.substr(0, 7) == "Bearer ") {
            return value.substr(7);
        }
    }

    auto cookie_it = req.find(http::field::cookie);
    if (cookie_it != req.end()) {
        std::string cookies(cookie_it->value());
        size_t pos = 0;
        while (pos <= cookies.size()) {
            size_t semi = cookies.find(';', pos);
            std::string pair = cookies.substr(pos, semi == std::string::npos ? std::string::npos : semi - pos);
            auto eq = pair.find('=');
            if (eq != std::string::npos) {
                std::string name = pair.substr(0, eq);
                name.erase(0, name.find_first_not_of(" \t"));
                name.erase(name.find_last_not_of(" \t") + 1);
                if (name == "blog_token") {
                    return pair.substr(eq + 1);
                }
            }
            if (semi == std::string::npos) break;
            pos = semi + 1;
        }
    }
    return "";
}

// @cuiruoni+生成JWT token，包含issuer、subject(user_id)、username、role声明
// @cuiruoni+使用HS256算法签名，过期时间从配置读取
std::string generate_token(int64_t user_id, const std::string& username, const std::string& role) {
    // @cuiruoni+每个token携带唯一jti：JWT只有秒级iat、payload相同时同一秒内重复签发
    // @cuiruoni+会得到完全相同的token —— 若旧的那份已被登出拉黑，"登出后立即重新登录"
    // @cuiruoni+拿到的新会话会天生处于黑名单状态。加jti让每次签发独一无二。
    // @cuiruoni+thread_local：多线程服务里函数级 static 是所有 IO 线程共用的，
    // @cuiruoni+mt19937_64 与 uniform_int_distribution 的 operator() 都会改写自身状态，
    // @cuiruoni+并发签发就是数据竞争（UB）；真吐出重复值时两条会话共用同一个 jti，
    // @cuiruoni+其中一人登出拉黑，另一个人的 token 也一起失效。
    thread_local std::mt19937_64 gen{std::random_device{}()};
    thread_local std::uniform_int_distribution<unsigned long long> dist;
    const std::string jti =
        std::to_string(std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::system_clock::now().time_since_epoch()).count()) +
        "-" + std::to_string(dist(gen));

    auto token = jwt::create<jwt::traits::boost_json>()
        .set_issuer("cpp-blog")
        .set_type("JWT")
        .set_subject(std::to_string(user_id))
        .set_payload_claim("username", jwt::traits::boost_json::value_type(username))
        .set_payload_claim("role", jwt::traits::boost_json::value_type(role))
        .set_id(jti)
        .set_issued_at(std::chrono::system_clock::now())
        .set_expires_at(std::chrono::system_clock::now() +
                        std::chrono::seconds{Config::instance().jwt_expire_seconds()})
        .sign(jwt::algorithm::hs256{Config::instance().jwt_secret()});
    return token;
}

// @cuiruoni+验证JWT token：先检查黑名单→解码→验签→提取用户信息
// @cuiruoni+验证失败返回false（包括token过期、签名不匹配、在黑名单中）
bool validate_token(const std::string& token, int64_t& user_id, std::string& username, std::string& role) {
    try {
        if (is_token_blacklisted(token)) return false;

        auto decoded = jwt::decode<jwt::traits::boost_json>(token);
        auto verifier = jwt::verify<jwt::traits::boost_json>()
            .allow_algorithm(jwt::algorithm::hs256{Config::instance().jwt_secret()})
            .with_issuer("cpp-blog");
        verifier.verify(decoded);

        user_id = std::stoll(decoded.get_subject());
        username = decoded.get_payload_claim("username").as_string();
        role = decoded.get_payload_claim("role").as_string();
        return true;
    } catch (const std::exception& e) {
        spdlog::warn("Token validation failed: {}", e.what());
        return false;
    }
}

// @cuiruoni+检查token是否在Redis黑名单中（用户注销时加入）
bool is_token_blacklisted(const std::string& token) {
    auto ctx = RedisPool::instance().acquire();
    if (!ctx) return false;

    std::string key = "jwt_blacklist:" + token;
    redisReply* reply = (redisReply*)redisCommand(ctx.get(), "EXISTS %s", key.c_str());
    bool exists = (reply && reply->type == REDIS_REPLY_INTEGER && reply->integer == 1);
    freeReplyObject(reply);
    return exists;
}

// @cuiruoni+将token加入Redis黑名单，设置TTL等于JWT过期时间，过期自动清除
// @cuiruoni+这样即使token未过期，注销后也无法再使用
void blacklist_token(const std::string& token, int ttl_seconds) {
    auto ctx = RedisPool::instance().acquire();
    if (!ctx) return;

    std::string key = "jwt_blacklist:" + token;
    redisReply* reply = (redisReply*)redisCommand(ctx.get(), "SET %s 1 EX %d", key.c_str(), ttl_seconds);
    freeReplyObject(reply);
    spdlog::info("Token blacklisted for {} seconds", ttl_seconds);
}

// @cuiruoni+从HTTP请求Authorization头提取Bearer token并验证
bool extract_user_from_token(const http::request<http::string_body>& req,
                             int64_t& user_id, std::string& username, std::string& role) {
    std::string token = extract_token_from_request(req);
    if (token.empty()) return false;
    return validate_token(token, user_id, username, role);
}

// @cuiruoni+从HTTP请求Authorization头提取Bearer token并验证，同时检查admin角色
bool extract_admin_from_token(const http::request<http::string_body>& req,
                              int64_t& user_id, std::string& username, std::string& role) {
    if (!extract_user_from_token(req, user_id, username, role)) return false;
    return role == "admin";
}

namespace {

// @cuiruoni+登录失败的两层阈值与窗口。
// @cuiruoni+第一层按「用户名 + 客户端 IP」：同一个来源把这个账号试错 5 次就锁 30 分钟，强度同改动前。
// @cuiruoni+第二层按「用户名」：不分来源，30 分钟累计 20 次失败也锁。
// @cuiruoni+为什么要拆成两层：原先只有按用户名的 5 次锁定，等于任何人对 admin 连错 5 次，
// @cuiruoni+就能把真管理员挡在门外 30 分钟（不需要密码，纯粹的 DoS）；
// @cuiruoni+但只按 IP 又会漏掉「换 IP 慢速撞同一个账号」，所以账号层保留、阈值抬高到 4 倍。
constexpr int kFailWindowSeconds = 1800;
constexpr int kMaxFailsPerIp = 5;
constexpr int kMaxFailsPerAccount = 20;

// @cuiruoni+redisCommand 是按空白切参数的单行文本，用户名是登录入口的自由输入，
// @cuiruoni+里面混进空格/换行会把一条命令劈出多余参数（arity 报错 → 返回 null → 计数静默丢失，
// @cuiruoni+看起来有锁定实际完全不生效）。键的组成部分一律按白名单过滤。
std::string key_part(std::string value, size_t max_len) {
    if (value.size() > max_len) value.resize(max_len);
    for (char& c : value) {
        bool keep = (c >= '0' && c <= '9') || (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')
                    || c == '_' || c == '-' || c == '.' || c == '@' || c == ':';
        if (!keep) c = '_';
    }
    return value;
}

std::string per_ip_key(const std::string& username, const std::string& client_ip) {
    return "login_fail:" + key_part(client_ip, 64) + ":" + key_part(username, 64);
}

std::string per_account_key(const std::string& username) {
    return "login_fail_all:" + key_part(username, 64);
}

// @cuiruoni+计数 +1，INCR 返回 1 说明键是新建的、还没有过期时间，此时补 TTL
long long incr_with_window(redisContext* ctx, const std::string& key) {
    redisReply* reply = (redisReply*)redisCommand(ctx, "INCR %s", key.c_str());
    long long count = 0;
    if (reply) {
        if (reply->type == REDIS_REPLY_INTEGER) count = reply->integer;
        freeReplyObject(reply);
    }
    if (count == 1) {
        redisReply* expire_reply =
            (redisReply*)redisCommand(ctx, "EXPIRE %s %d", key.c_str(), kFailWindowSeconds);
        if (expire_reply) freeReplyObject(expire_reply);
    }
    return count;
}

long long read_count(redisContext* ctx, const std::string& key) {
    redisReply* reply = (redisReply*)redisCommand(ctx, "GET %s", key.c_str());
    if (!reply) return 0;
    long long count = 0;
    if (reply->type == REDIS_REPLY_INTEGER) {
        count = reply->integer;
    } else if (reply->type == REDIS_REPLY_STRING) {
        try { count = std::stoll(reply->str); } catch (...) {}
    }
    freeReplyObject(reply);
    return count;
}

} // namespace

// @cuiruoni+记录一次登录失败（两层计数各自 +1）
void record_login_failure(const std::string& username, const std::string& client_ip) {
    auto ctx = RedisPool::instance().acquire();
    if (!ctx) return;  // @cuiruoni+Redis 不可用时锁定不生效，与改动前一致（登录本身仍受密码校验保护）

    long long per_ip = incr_with_window(ctx.get(), per_ip_key(username, client_ip));
    long long per_account = incr_with_window(ctx.get(), per_account_key(username));

    if (per_ip >= kMaxFailsPerIp) {
        spdlog::warn("Login locked (per source): user={} ip={} fails={}", username, client_ip, per_ip);
    } else if (per_account >= kMaxFailsPerAccount) {
        spdlog::warn("Login locked (account total {}): user={} —— 多来源累计，可能是分布式撞库",
                     kMaxFailsPerAccount, username);
    }
}

// @cuiruoni+任一层达到阈值即视为锁定
bool is_account_locked(const std::string& username, const std::string& client_ip) {
    auto ctx = RedisPool::instance().acquire();
    if (!ctx) return false;

    if (read_count(ctx.get(), per_ip_key(username, client_ip)) >= kMaxFailsPerIp) return true;
    return read_count(ctx.get(), per_account_key(username)) >= kMaxFailsPerAccount;
}

// @cuiruoni+登录成功后清掉本来源的计数与账号累计数
// @cuiruoni+（其它 IP 的键不扫是为了避开 KEYS；它们自带 30 分钟 TTL，会自己过期）
void clear_login_failures(const std::string& username, const std::string& client_ip) {
    auto ctx = RedisPool::instance().acquire();
    if (!ctx) return;

    const std::string ip_key = per_ip_key(username, client_ip);
    const std::string account_key = per_account_key(username);
    redisReply* reply = (redisReply*)redisCommand(ctx.get(), "DEL %s %s",
                                                  ip_key.c_str(), account_key.c_str());
    if (reply) freeReplyObject(reply);
}

}
