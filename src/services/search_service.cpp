#include "services/search_service.h"
#include "db/mysql_pool.h"
#include "db/redis_pool.h"
#include "utils/logger.h"
#include "utils/mysqlx_helper.h"

namespace search_service {

json::array search(const std::string& keyword) {
    if (keyword.empty()) return json::array{};

    std::string cache_key = "search:" + keyword;
    auto ctx = RedisPool::instance().get();
    if (ctx) {
        redisReply* reply = (redisReply*)redisCommand(ctx, "GET %s", cache_key.c_str());
        if (reply && reply->type == REDIS_REPLY_STRING) {
            std::string cached(reply->str);
            freeReplyObject(reply);
            RedisPool::instance().release(ctx);
            try {
                return json::parse(cached).as_array();
            } catch (...) {}
        }
        if (reply) freeReplyObject(reply);
        RedisPool::instance().release(ctx);
    }

    auto sess = MysqlPool::instance().get();
    if (!sess) return json::array{};

    try {
        auto result = sess->sql(
            "SELECT id, title, summary, status, view_count, created_at, "
            "MATCH(title, content_md) AGAINST(:q IN NATURAL LANGUAGE MODE) AS relevance "
            "FROM posts WHERE MATCH(title, content_md) AGAINST(:q IN NATURAL LANGUAGE MODE) "
            "ORDER BY relevance DESC LIMIT 20")
            .bind("q", keyword).execute();

        json::array arr;
        for (auto row : result) {
            json::object obj;
            obj["id"] = mysqlx_helper::to_json(row[0]);
            obj["title"] = mysqlx_helper::to_string(row[1]);
            obj["summary"] = row[2].isNull() ? "" : mysqlx_helper::to_string(row[2]);
            obj["status"] = mysqlx_helper::to_string(row[3]);
            obj["view_count"] = mysqlx_helper::to_json(row[4]);
            obj["created_at"] = mysqlx_helper::to_string(row[5]);
            arr.push_back(obj);
        }

        MysqlPool::instance().release(sess);

        ctx = RedisPool::instance().get();
        if (ctx) {
            std::string serialized = json::serialize(arr);
            redisReply* reply = (redisReply*)redisCommand(ctx, "SET %s %s EX 300",
                cache_key.c_str(), serialized.c_str());
            freeReplyObject(reply);
            RedisPool::instance().release(ctx);
        }

        return arr;
    } catch (const std::exception& e) {
        spdlog::error("Search error: {}", e.what());
        MysqlPool::instance().release(sess);
        return json::array{};
    }
}

}
