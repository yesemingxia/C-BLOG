#include "services/search_service.h"
#include "dao/search_dao.h"
#include "db/redis_pool.h"
#include "utils/logger.h"

#include <sstream>
#include <iomanip>

namespace search_service {

// @cuiruoni+将keyword转为安全的Redis key：只保留字母数字，其余转hex，截断到100字符
static std::string sanitize_cache_key(const std::string& keyword) {
    std::ostringstream oss;
    oss << "search:";
    for (unsigned char c : keyword) {
        if (std::isalnum(c)) {
            oss << static_cast<char>(c);
        } else {
            oss << '%' << std::hex << std::setw(2) << std::setfill('0') << static_cast<int>(c);
        }
    }
    std::string key = oss.str();
    if (key.size() > 120) key = key.substr(0, 120);
    return key;
}

json::array search(const std::string& keyword) {
    if (keyword.empty()) return json::array{};

    std::string cache_key = sanitize_cache_key(keyword);
    auto ctx = RedisPool::instance().acquire();
    if (ctx) {
        redisReply* reply = (redisReply*)redisCommand(ctx.get(), "GET %s", cache_key.c_str());
        if (reply && reply->type == REDIS_REPLY_STRING) {
            std::string cached(reply->str);
            freeReplyObject(reply);
            try {
                return json::parse(cached).as_array();
            } catch (...) {}
        }
        if (reply) freeReplyObject(reply);
    }

    // @cuiruoni+通过DAO层查询MySQL全文索引
    auto arr = search_dao::search(keyword);

    if (ctx && !arr.empty()) {
        std::string serialized = json::serialize(arr);
        redisReply* reply = (redisReply*)redisCommand(ctx.get(), "SET %s %s EX 300",
            cache_key.c_str(), serialized.c_str());
        if (reply) freeReplyObject(reply);
    }

    return arr;
}

}
