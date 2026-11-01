#pragma once
#include <string>
#include <vector>
#include <boost/json.hpp>

namespace json = boost::json;

namespace search_dao {
// @cuiruoni+搜索数据访问对象，封装全文搜索的数据库操作
// @cuiruoni+viewer_id/is_admin 用于可见性过滤：匿名只看 public，登录额外看 members/自己的 private
// @cuiruoni+B9：分页返回，total 为可见性过滤后的命中总数
json::array search(const std::string& keyword, int64_t viewer_id, bool is_admin,
                   int page, int page_size, int& total);
}
