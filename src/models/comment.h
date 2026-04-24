#pragma once

#include <string>
#include <cstdint>

struct Comment {
    int64_t id = 0;
    int64_t post_id = 0;
    std::string author_name;
    std::string author_email;
    std::string content;
    int64_t parent_id = 0;
    std::string created_at;
};
