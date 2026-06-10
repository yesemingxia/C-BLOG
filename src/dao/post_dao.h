#pragma once

#include "models/post.h"
#include <string>
#include <vector>
#include <boost/json.hpp>

namespace json = boost::json;

// @cuiruoni+文章数据访问对象，封装所有文章相关的数据库操作
namespace post_dao {

// @cuiruoni+分页查询文章列表，支持按status过滤，返回文章摘要信息
json::array list_posts(int page, int page_size, const std::string& status, int& total);

// @cuiruoni+根据ID查询文章详情
Post find_by_id(int64_t id);

// @cuiruoni+浏览量自增
bool increment_view_count(int64_t id);

// @cuiruoni+创建文章，返回新文章ID
int64_t insert(const Post& post, const std::string& content_html, const std::string& summary);

// @cuiruoni+更新文章
bool update(int64_t id, const Post& post, const std::string& content_html);

// @cuiruoni+删除文章（事务：删除评论、标签关联、文章）
bool delete_by_id(int64_t id);

// @cuiruoni+查询文章的user_id，用于权限校验
int64_t find_user_id(int64_t post_id);

// @cuiruoni+加载文章关联的标签名列表
std::vector<std::string> load_tags(int64_t post_id);

// @cuiruoni+同步文章标签关联（先删后插）
void sync_tags(int64_t post_id, const std::vector<std::string>& tags);

// @cuiruoni+管理员分页查询文章列表（含作者信息），支持状态过滤
json::array admin_list_posts(int page, int page_size, const std::string& status, int& total);

// @cuiruoni+检查文章ID是否存在
bool exists_by_id(int64_t post_id);

// @cuiruoni+统计文章总数
int64_t count_all();

// @cuiruoni+按状态统计文章数
int64_t count_by_status(const std::string& status);

}
