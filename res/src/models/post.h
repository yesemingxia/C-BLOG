#pragma once

#include <string>
#include <cstdint>
#include <vector>

// @cuiruoni+文章数据模型，同时存储Markdown原文(content_md)和渲染后HTML(content_html)
struct Post {
    int64_t id = 0;
    std::string title;
    std::string content_md;      // @cuiruoni+Markdown原文，用于编辑回显
    std::string content_html;    // @cuiruoni+渲染后的HTML，用于前端展示
    std::string summary;         // @cuiruoni+摘要，未提供时自动截取前200字符
    std::vector<std::string> tags;
    int64_t user_id = 0;
    std::string status;          // @cuiruoni+文章状态：draft(草稿)/published(已发布)
    int view_count = 0;
    std::string created_at;
    std::string updated_at;
};
