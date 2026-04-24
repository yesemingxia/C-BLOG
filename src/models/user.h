#pragma once

#include <string>
#include <cstdint>

struct User {
    int64_t id = 0;
    std::string username;
    std::string password_hash;
    std::string salt;
    std::string email;
    std::string role;
    std::string created_at;
};
