#include "services/search_service.h"
#include "dao/search_dao.h"
#include "db/redis_pool.h"
#include "utils/logger.h"

#include <sstream>
#include <iomanip>
#include <functional>

namespace search_service {

// @cuiruoni+将keyword转为安全的Redis key：只保留字母数字，其余转hex，过长则折叠成「前缀+全串指纹」
// @cuiruoni+A2：key 里带全局 epoch，文章可见性/内容一变，旧缓存立即不可达
static std::string sanitize_cache_key(const std::string& keyword, const std::string& epoch,
                                      int page, int page_size) {
    std::ostringstream oss;
    // @cuiruoni+P0安全修复：版本号使修复前的旧缓存（可能含草稿）立即失效
    // @cuiruoni+A2：v3 对应「可见性过滤 + ngram 索引」
    // @cuiruoni+B9：v4 缓存值改为 {results,total} 并带上分页参数，v3 缓存作废
    oss << "search:v4:public:" << epoch << ":" << page << ":" << page_size << ":";
    for (unsigned char c : keyword) {
        if (std::isalnum(c)) {
            oss << static_cast<char>(c);
        } else {
            oss << '%' << std::hex << std::setw(2) << std::setfill('0') << static_cast<int>(c);
        }
    }
    std::string key = oss.str();
    // @cuiruoni+原来这里是「超过 120 直接截断」：中文关键词每个字节转成 %XX 是 3 倍长，
    // @cuiruoni+两个前 40 字相同、后文不同的长关键词会算出同一个 Redis key，
    // @cuiruoni+后一个搜索直接读到前一个的结果（列表和 total 都是别人的）。
    // @cuiruoni+改成「可读前缀 + 全串指纹」：前缀仍然便于在 redis-cli 里认出来，
    // @cuiruoni+指纹保证不同关键词不会撞键；epoch 仍然在最前面，失效语义不变。
    constexpr size_t kMaxCacheKeyBytes = 120;
    if (key.size() > kMaxCacheKeyBytes) {
        std::ostringstream folded;
        folded << key.substr(0, kMaxCacheKeyBytes - 24) << ":fp"
               << std::hex << std::hash<std::string>{}(keyword);
        key = folded.str();
    }
    return key;
}

SearchResult search(const std::string& keyword, int64_t viewer_id, bool is_admin,
                    int page, int page_size) {
    SearchResult out;
    if (keyword.empty()) return out;

    // @cuiruoni+A2：登录结果可能包含 members/自己的 private，按用户维度缓存会串结果；
    // @cuiruoni+搜索不是高频接口，改为「匿名缓存、登录直查」，优先保证不泄露
    const bool cacheable = (viewer_id <= 0 && !is_admin);
    if (!cacheable) {
        out.results = search_dao::search(keyword, viewer_id, is_admin, page, page_size, out.total);
        return out;
    }

    auto ctx = RedisPool::instance().acquire();
    out.cache_enabled = static_cast<bool>(ctx);
    std::string epoch = "0";
    if (ctx) {
        redisReply* epoch_reply = (redisReply*)redisCommand(ctx.get(), "GET search:v4:epoch");
        if (epoch_reply && epoch_reply->type == REDIS_REPLY_STRING) {
            epoch.assign(epoch_reply->str, epoch_reply->len);
        }
        if (epoch_reply) freeReplyObject(epoch_reply);
    }
    std::string cache_key = sanitize_cache_key(keyword, epoch, page, page_size);
    if (ctx) {
        redisReply* reply = (redisReply*)redisCommand(ctx.get(), "GET %s", cache_key.c_str());
        if (reply && reply->type == REDIS_REPLY_STRING) {
            std::string cached(reply->str, reply->len);
            freeReplyObject(reply);
            // @crnl+F1：释放后置空。否则下面 JSON 解析抛异常被 catch 吞掉后，
            // 分支外的 if (reply) 会对同一指针二次释放（缓存脏数据即触发）
            reply = nullptr;
            try {
                auto obj = json::parse(cached).as_object();
                out.results = obj.at("results").as_array();
                out.total = static_cast<int>(obj.at("total").as_int64());
                out.cache_hit = true;
                return out;
            } catch (...) {}
        }
        if (reply) freeReplyObject(reply);
    }

    // @cuiruoni+通过DAO层查询MySQL全文索引
    out.results = search_dao::search(keyword, 0, false, page, page_size, out.total);

    if (ctx) {
        json::object payload{
            {"results", out.results},
            {"total", out.total},
        };
        std::string serialized = json::serialize(payload);
        redisReply* reply = (redisReply*)redisCommand(ctx.get(), "SET %s %s EX 300",
            cache_key.c_str(), serialized.c_str());
        if (reply) freeReplyObject(reply);
    }

    return out;
}

void invalidate_cache() {
    auto ctx = RedisPool::instance().acquire();
    if (!ctx) return;
    redisReply* reply = (redisReply*)redisCommand(ctx.get(), "INCR search:v4:epoch");
    if (reply) freeReplyObject(reply);
}

}
