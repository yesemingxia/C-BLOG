#pragma once

#include <string>
#include <cstdint>

// @cuiruoni+评论数据模型，支持嵌套评论（parent_id指向父评论，0表示顶级评论）
struct Comment {
    int64_t id = 0;
    int64_t post_id = 0;
    std::string author_name;
    std::string author_email;
    std::string content;
    int64_t parent_id = 0; // @cuiruoni+父评论ID，0表示顶级评论，非0表示回复
    std::string created_at;
};
