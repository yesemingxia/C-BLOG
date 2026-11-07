#pragma once

#include "models/user.h"
#include <optional>
#include <string>
#include <vector>
#include <boost/json.hpp>

namespace json = boost::json;

// @cuiruoni+用户数据访问对象，封装所有用户相关的数据库操作
namespace user_dao {

// @cuiruoni+根据用户名查询用户是否存在，返回匹配的行数
int64_t count_by_username(const std::string& username);

// @cuiruoni+B2：邮箱唯一性校验。exclude_user_id 用于改资料时排除自己。
int64_t count_by_email(const std::string& email, int64_t exclude_user_id = 0);

// @cuiruoni+创建用户，返回新用户ID
int64_t insert(const std::string& username, const std::string& password_hash,
               const std::string& salt, const std::string& email);

// @cuiruoni+B2：先精确匹配用户名，再匹配唯一邮箱；不再用 OR 依赖数据库返回顺序
bool find_by_username_or_email(const std::string& username,
                               int64_t& id, std::string& db_username,
                               std::string& password_hash, std::string& salt,
                               std::string& role, std::string& email);

// @cuiruoni+根据用户ID查询用户完整资料
json::object find_profile_by_id(int64_t user_id);

// @cuiruoni+B3：资料更新的部分更新语义 —— 只有 optional 有值才写该列
struct ProfilePatch {
    std::optional<std::string> email;
    std::optional<std::string> bio;
    std::optional<std::string> avatar;
    std::optional<std::string> location;
    std::optional<std::string> website;
    std::optional<std::string> twitter;
};

bool update_profile(int64_t user_id, const ProfilePatch& patch);

// @cuiruoni+B5：评论落库时取当前用户邮箱
bool find_email_by_id(int64_t user_id, std::string& email);

// background setting (JSON string: {"type":"image|style|none","style_id":"...","image_url":"..."})
bool get_background(int64_t user_id, std::string& background_json);

bool update_background(int64_t user_id, const std::string& background_json);

// @cuiruoni+查询用户密码哈希和盐，用于修改密码时验证旧密码
bool find_password_by_id(int64_t user_id, std::string& password_hash, std::string& salt);

// @cuiruoni+更新用户密码
bool update_password(int64_t user_id, const std::string& new_hash_b64, const std::string& new_salt_b64);

// @cuiruoni+根据用户名查询用户公开资料及其文章列表
json::object find_public_profile_by_username(const std::string& username);

// @cuiruoni+查询用户总数
int64_t count_all();

// @cuiruoni+B6/B7：服务端搜索 + 白名单排序，total 为搜索过滤后的总数
json::array list_users(int page, int page_size, int& total,
                       const std::string& q = "",
                       const std::string& sort = "created_at",
                       const std::string& order = "desc");

// @cuiruoni+检查用户ID是否存在
bool exists_by_id(int64_t user_id);

// @crnl+F2：鉴权回查——按 id 取当前 username/role；用户不存在或查询失败返回 false
bool find_auth_state_by_id(int64_t user_id, std::string& username, std::string& role);

// @cuiruoni+更新用户角色
bool update_role(int64_t user_id, const std::string& new_role);

// @cuiruoni+删除用户
bool delete_by_id(int64_t user_id);

// @cuiruoni+根据用户名查询用户ID（不存在返回0）
int64_t find_id_by_username(const std::string& username);

// @cuiruoni+关注/粉丝功能
int64_t count_followers(int64_t user_id);
int64_t count_following(int64_t user_id);
bool is_following(int64_t follower_id, int64_t followee_id);
bool follow(int64_t follower_id, int64_t followee_id);
bool unfollow(int64_t follower_id, int64_t followee_id);

}
