#pragma once

#include <string>
#include <vector>
#include <boost/json.hpp>

namespace json = boost::json;

// @cuiruoni+评论数据访问对象，封装所有评论相关的数据库操作
namespace comment_dao {

// @cuiruoni+根据文章ID查询评论列表
json::array list_by_post_id(int64_t post_id);

// @cuiruoni+按ID查询单条评论，结构与 list_by_post_id 的元素完全一致；查不到返回空对象
// @cuiruoni+用于创建评论后回传完整对象（前端需要它做列表追加）
json::object get_by_id(int64_t comment_id);

// @cuiruoni+创建评论（有parent_id，回复评论），返回新评论ID，0表示失败
int64_t insert_with_parent(int64_t post_id, const std::string& author_name,
                           const std::string& author_email, const std::string& content,
                           int64_t parent_id);

// @cuiruoni+创建评论（无parent_id，顶级评论），返回新评论ID，0表示失败
int64_t insert(int64_t post_id, const std::string& author_name,
               const std::string& author_email, const std::string& content);

// @cuiruoni+统计评论总数
int64_t count_all();

// @cuiruoni+管理员分页查询评论列表（含文章标题）
json::array admin_list_comments(int page, int page_size, int& total);

// @cuiruoni+检查评论ID是否存在
bool exists_by_id(int64_t comment_id);

// @cuiruoni+删除评论
bool delete_by_id(int64_t comment_id);

}
