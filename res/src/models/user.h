#pragma once

#include <string>
#include <cstdint>

// @cuiruoni+用户数据模型，密码以加盐哈希方式存储，不保存明文
struct User {
    int64_t id = 0;
    std::string username;
    std::string password_hash; // @cuiruoni+PBKDF2哈希后的密码（Base64编码存储）
    std::string salt;          // @cuiruoni+随机盐（Base64编码存储）
    std::string email;
    std::string role;          // @cuiruoni+角色：admin/user
    std::string created_at;
};
