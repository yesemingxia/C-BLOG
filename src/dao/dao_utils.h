#pragma once

#include <algorithm>
#include <string>
#include <unordered_map>

// @cuiruoni+B7：后台表头排序。用户输入只用于查白名单，绝不直接拼进 SQL。
namespace dao_utils {

inline std::string build_order_by(const std::string& sort, const std::string& order,
                                  const std::unordered_map<std::string, std::string>& columns,
                                  const std::string& default_sort) {
    auto it = columns.find(sort);
    std::string column = it != columns.end() ? it->second : columns.at(default_sort);

    std::string dir = order;
    std::transform(dir.begin(), dir.end(), dir.begin(),
                   [](unsigned char c) { return static_cast<char>(std::tolower(c)); });

    std::string result = " ORDER BY " + column + (dir == "asc" ? " ASC" : " DESC");

    // @cuiruoni+主键兜底：同一秒写入的两行（批量导入、并发注册）在 created_at 上并列，
    // @cuiruoni+MySQL 对并列行的先后不保证，翻页时会出现「第 1 页和第 2 页返回同一条、
    // @cuiruoni+另一条任何一页都不出现」。第五轮给通知列表加 `id DESC` 就是为这个，
    // @cuiruoni+这里收到公共出口，四个后台列表一次都覆盖上。
    auto id_it = columns.find("id");
    if (id_it != columns.end() && id_it->second != column) {
        result += ", " + id_it->second + (dir == "asc" ? " ASC" : " DESC");
    }
    return result;
}

} // namespace dao_utils
