#pragma once

#include "models/user.h"
#include <string>
#include <vector>
#include <boost/json.hpp>

namespace json = boost::json;

// @cuiruoni+用户数据访问对象，封装所有用户相关的数据库操作
namespace user_dao {

// @cuiruoni+根据用户名查询用户是否存在，返回匹配的行数
int64_t count_by_username(const std::string& username);

// @cuiruoni+创建用户，返回新用户ID
int64_t insert(const std::string& username, const std::string& password_hash,
               const std::string& salt, const std::string& email);

// @cuiruoni+根据用户名或邮箱查询用户登录信息（id, username, password_hash, salt, role, email）
bool find_by_username_or_email(const std::string& username,
                               int64_t& id, std::string& db_username,
                               std::string& password_hash, std::string& salt,
                               std::string& role, std::string& email);

// @cuiruoni+根据用户ID查询用户完整资料
json::object find_profile_by_id(int64_t user_id);

// @cuiruoni+更新用户资料（email, bio, avatar, location, website, twitter）
bool update_profile(int64_t user_id, const std::string& email,
                    const std::string& bio, const std::string& avatar,
                    const std::string& location, const std::string& website,
                    const std::string& twitter);

// @cuiruoni+查询用户密码哈希和盐，用于修改密码时验证旧密码
bool find_password_by_id(int64_t user_id, std::string& password_hash, std::string& salt);

// @cuiruoni+更新用户密码
bool update_password(int64_t user_id, const std::string& new_hash_b64, const std::string& new_salt_b64);

// @cuiruoni+根据用户名查询用户公开资料及其文章列表
json::object find_public_profile_by_username(const std::string& username);

// @cuiruoni+查询用户总数
int64_t count_all();

// @cuiruoni+分页查询用户列表（不含密码字段）
json::array list_users(int page, int page_size, int& total);

// @cuiruoni+检查用户ID是否存在
bool exists_by_id(int64_t user_id);

// @cuiruoni+更新用户角色
bool update_role(int64_t user_id, const std::string& new_role);

// @cuiruoni+删除用户
bool delete_by_id(int64_t user_id);

}
