#pragma once

#include <string>
#include <vector>
#include <boost/json.hpp>

namespace json = boost::json;

// @cuiruoni+标签数据访问对象，封装所有标签相关的数据库操作
namespace tag_dao {

// @cuiruoni+查询所有标签列表（含每个标签关联的文章数）
// @cuiruoni+viewer_id/is_admin 用于可见性过滤，计数与点进去的结果保持一致
json::array list_with_post_count(int64_t viewer_id = 0, bool is_admin = false);

// @cuiruoni+B9：标签下文章分页，total 为可见性过滤后的总数
json::array find_posts_by_tag_id(int64_t tag_id, int64_t viewer_id, bool is_admin,
                                 int page, int page_size, int& total);

}
