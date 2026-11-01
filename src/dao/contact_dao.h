#pragma once

#include <string>
#include <boost/json.hpp>

// @cuiruoni+联系消息数据访问对象，封装联系表单的数据库操作
namespace json = boost::json;

namespace contact_dao {

// @cuiruoni+插入联系消息
bool insert(const std::string& name, const std::string& email, const std::string& message);

// @cuiruoni+B6/B7：管理员分页查看留言，支持服务端搜索与白名单排序
json::array list(int page, int page_size, int& total,
                 const std::string& q = "",
                 const std::string& sort = "created_at",
                 const std::string& order = "desc");

// @cuiruoni+留言是否存在
bool exists_by_id(int64_t id);

// @cuiruoni+删除留言
bool delete_by_id(int64_t id);

}
