#include "services/search_service.h"
#include "dao/search_dao.h"
#include "db/redis_pool.h"
#include "utils/logger.h"

namespace search_service {

json::array search(const std::string& keyword) {
    if (keyword.empty()) return json::array{};

    std::string cache_key = "search:" + keyword;
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
