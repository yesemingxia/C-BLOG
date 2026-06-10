#pragma once

#include <string>
#include <vector>
#include <boost/json.hpp>

namespace json = boost::json;

// @cuiruoni+标签数据访问对象，封装所有标签相关的数据库操作
namespace tag_dao {

// @cuiruoni+查询所有标签列表（含每个标签关联的文章数）
json::array list_with_post_count();

// @cuiruoni+根据标签ID查询关联的文章列表
json::array find_posts_by_tag_id(int tag_id);

}
