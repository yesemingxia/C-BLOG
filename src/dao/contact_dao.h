#pragma once

#include <string>
#include <boost/json.hpp>

// @cuiruoni+联系消息数据访问对象，封装联系表单的数据库操作
namespace json = boost::json;

namespace contact_dao {

// @cuiruoni+插入联系消息
bool insert(const std::string& name, const std::string& email, const std::string& message);

// @cuiruoni+管理员分页查看留言（按时间倒序），total 回传总数
json::array list(int page, int page_size, int& total);

// @cuiruoni+留言是否存在
bool exists_by_id(int64_t id);

// @cuiruoni+删除留言
bool delete_by_id(int64_t id);

}
