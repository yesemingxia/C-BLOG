#pragma once

#include "models/post.h"
#include <optional>
#include <string>
#include <vector>
#include <boost/json.hpp>

namespace json = boost::json;

// @cuiruoni+文章数据访问对象，封装所有文章相关的数据库操作
namespace post_dao {

// @cuiruoni+B3：部分更新语义 —— 只有 optional 有值才写对应列
struct PostPatch {
    std::optional<std::string> title;
    std::optional<std::string> content_md;
    std::optional<std::string> summary;
    std::optional<std::string> status;
    std::optional<std::string> cover;
    std::optional<std::string> visibility;
    std::optional<std::vector<std::string>> tags;

    bool empty() const {
        return !title && !content_md && !summary && !status && !cover &&
               !visibility && !tags;
    }
};

// @cuiruoni+分页查询文章列表，支持按status过滤，返回文章摘要信息
// @cuiruoni+viewer_id/is_admin用于权限过滤：草稿只对作者本人（或管理员）可见
json::array list_posts(int page, int page_size, const std::string& status, int& total,
                       int64_t viewer_id = 0, bool is_admin = false);

// @cuiruoni+某作者自己的全部文章（含草稿），个人中心「我的文章」专用
json::array list_by_author(int64_t author_id, int page, int page_size, int& total);

// @cuiruoni+根据ID查询文章详情
Post find_by_id(int64_t id);

// @cuiruoni+浏览量自增
bool increment_view_count(int64_t id);

// @cuiruoni+创建文章，返回新文章ID
int64_t insert(const Post& post, const std::string& content_html, const std::string& summary);

// @cuiruoni+B3：按字段存在性更新；content_html 仅在 patch.content_md 有值时使用
bool update_patch(int64_t id, const PostPatch& patch, const std::string& content_html);

// @cuiruoni+删除文章（事务：删除评论、标签关联、文章）
bool delete_by_id(int64_t id);

// @cuiruoni+查询文章的user_id，用于权限校验
int64_t find_user_id(int64_t post_id);

// @cuiruoni+加载文章关联的标签名列表
std::vector<std::string> load_tags(int64_t post_id);

// @cuiruoni+批量为列表结果补 tags 字段（一次 IN 查询，避免逐篇 N+1）
void attach_tags(json::array& posts);

// @cuiruoni+同步文章标签关联（先删后插）
void sync_tags(int64_t post_id, const std::vector<std::string>& tags);

// @cuiruoni+B1 残留（图片回收第一步）：取出候选文本，交给 storage::extract_image_names 解析。
// @cuiruoni+post_id > 0 只看这一篇；user_id > 0 看这个作者的全部文章；两者都是 0 时返回空
// @cuiruoni+（绝不做全表扫描）。返回的是 cover 与 content_md 的原始字符串，可能含 URL 也可能为空。
std::vector<std::string> list_media_texts(int64_t post_id, int64_t user_id);

// @cuiruoni+B1 残留（图片回收第二步）：这张图片目前还被多少行内容引用 ——
// @cuiruoni+文章封面/正文、评论正文、用户头像四处都算。返回 -1 表示查询失败，
// @cuiruoni+调用方必须把 -1 当「仍在引用」处理：宁可留一个孤儿文件，也不能删掉别人还在显示的照片。
int count_image_references(const std::string& name);

// @cuiruoni+B6/B7：管理员列表支持服务端搜索（标题/作者）与白名单排序
json::array admin_list_posts(int page, int page_size, const std::string& status, int& total,
                             const std::string& q = "",
                             const std::string& sort = "created_at",
                             const std::string& order = "desc");

// @cuiruoni+B8：近 N 个月已发布文章数（缺月补 0）
json::array count_monthly_published(int months);

// @cuiruoni+检查文章ID是否存在
bool exists_by_id(int64_t post_id);

// @cuiruoni+统计文章总数
int64_t count_all();

// @cuiruoni+按状态统计文章数
int64_t count_by_status(const std::string& status);

// @cuiruoni+点赞/收藏统计与状态
int64_t count_likes(int64_t post_id);
int64_t count_bookmarks(int64_t post_id);
int64_t count_comments(int64_t post_id);
bool is_liked(int64_t post_id, int64_t user_id);
bool is_bookmarked(int64_t post_id, int64_t user_id);
bool add_like(int64_t post_id, int64_t user_id);
bool remove_like(int64_t post_id, int64_t user_id);
bool add_bookmark(int64_t post_id, int64_t user_id);
bool remove_bookmark(int64_t post_id, int64_t user_id);

// @cuiruoni+当前用户点赞/收藏过的已发布文章列表
json::array list_liked_posts(int64_t user_id, int page, int page_size, int& total);
json::array list_bookmarked_posts(int64_t user_id, int page, int page_size, int& total);

}
