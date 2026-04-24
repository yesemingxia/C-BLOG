#pragma once

#include <string>
#include <cstdint>

struct Post {
    int64_t id = 0;
    std::string title;
    std::string content_md;
    std::string content_html;
    std::string summary;
    int64_t user_id = 0;
    std::string status;
    int view_count = 0;
    std::string created_at;
    std::string updated_at;
};
