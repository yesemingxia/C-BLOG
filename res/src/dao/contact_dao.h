#pragma once

#include <string>

// @cuiruoni+联系消息数据访问对象，封装联系表单的数据库操作
namespace contact_dao {

// @cuiruoni+插入联系消息
bool insert(const std::string& name, const std::string& email, const std::string& message);

}
