#pragma once

#include <string>
#include <vector>
#include <boost/json.hpp>

namespace json = boost::json;

// @cuiruoni+评论数据访问对象，封装所有评论相关的数据库操作
namespace comment_dao {

// @cuiruoni+B5：评论列表分页（按时间升序），total 为全量条数
json::array list_by_post_id(int64_t post_id, int page, int page_size, int& total);

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

// @cuiruoni+B6/B7：管理员列表支持服务端搜索（内容/作者/文章标题）与白名单排序
json::array admin_list_comments(int page, int page_size, int& total,
                                const std::string& q = "",
                                const std::string& sort = "created_at",
                                const std::string& order = "desc");

// @cuiruoni+检查评论ID是否存在
bool exists_by_id(int64_t comment_id);

// @cuiruoni+B5：取评论所属文章与作者，用于“父评论必须同文章”校验和作者删除权限
bool find_meta(int64_t comment_id, int64_t& post_id, std::string& author_name);

// @cuiruoni+删除评论
bool delete_by_id(int64_t comment_id);

}
