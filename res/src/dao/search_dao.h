#pragma once
#include <string>
#include <vector>
#include <boost/json.hpp>

namespace json = boost::json;

namespace search_dao {
// @cuiruoni+搜索数据访问对象，封装全文搜索的数据库操作
json::array search(const std::string& keyword);
}
