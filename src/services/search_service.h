#pragma once

#include <string>
#include <vector>
#include <boost/json.hpp>

namespace json = boost::json;

namespace search_service {

// @cuiruoni+B9：分页结果 + 是否命中 Redis 缓存（用于 X-Search-Cache 观测头）
struct SearchResult {
    json::array results;
    int total = 0;
    bool cache_hit = false;
    bool cache_enabled = false;
};

// @cuiruoni+A2：viewer 上下文参与可见性过滤；仅匿名结果可缓存
SearchResult search(const std::string& keyword, int64_t viewer_id, bool is_admin,
                    int page, int page_size);

// @cuiruoni+A2：文章创建/更新/删除后调用，递增全局 epoch 让旧搜索结果立即失效
void invalidate_cache();

}
