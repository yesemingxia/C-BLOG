#pragma once

#include <string>
#include <cstdint>

// @cuiruoni+标签数据模型，与文章多对多关系（通过post_tags关联表）
struct Tag {
    int id = 0;
    std::string name; // @cuiruoni+标签名，唯一约束
};
