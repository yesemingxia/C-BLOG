#pragma once

#include <string>
#include <vector>
#include <boost/json.hpp>
#include "models/post.h"
#include "dao/post_dao.h"

namespace json = boost::json;

namespace post_service {

// @cuiruoni+单篇可见性判断（纯逻辑，便于单测与多 controller 复用）：
// @cuiruoni+作者/管理员始终可见；其他人在 published 前提下按 visibility 判断
inline bool can_view_post(const Post& post, int64_t viewer_id, const std::string& role) {
    if (post.id == 0) return false;
    if (role == "admin" || (viewer_id > 0 && post.user_id == viewer_id)) return true;
    if (post.status != "published") return false;
    if (post.visibility == "public") return true;
    if (post.visibility == "members") return viewer_id > 0;
    return false; // private / 未知值：一律拒绝，避免脏数据导致意外公开
}

json::object post_to_json(const Post& post);
Post json_to_post(const json::object& obj);
post_dao::PostPatch json_to_post_patch(const json::object& obj);
json::array list_posts(int page, int page_size, const std::string& status, int& total,
                       int64_t viewer_id = 0, bool is_admin = false);
Post get_post(int64_t id, bool increment_view = true);
void increment_view_count(int64_t id);
int64_t create_post(const Post& post);
bool update_post_patch(int64_t id, const post_dao::PostPatch& patch);
bool delete_post(int64_t id);

// @cuiruoni+B1 残留：回收「数据库里已经没有任何一行引用」的本站图片文件。
// @cuiruoni+入参传的是原始文本（封面字段、正文、头像 URL 混着给都行），
// @cuiruoni+内部用 storage::extract_image_names 取文件名，只认 /api/upload/file/<name>。
// @cuiruoni+调用时机必须在删库成功之后：那时旧引用已经不在，计数才可能归零；
// @cuiruoni+早一步调用只会看到「仍被引用」，不会误删。返回真正删掉的个数。
size_t reclaim_images(const std::vector<std::string>& media_texts);

// @cuiruoni+B1 残留（另一半）：扫描 storage::images()，清掉「没有任何数据库行引用」的图片文件。
// @cuiruoni+覆盖 reclaim_images 触达不到的两类：上传后从未发布（不会有删除事件）、历史遗留。
// @cuiruoni+min_age_seconds 是安全闸：太新的文件可能是用户刚传、文章还没保存，必须跳过；
// @cuiruoni+默认 24 小时由调用方传（见 main.cpp 的定时器）。
// @cuiruoni+判定保守：文件名不在白名单、改不了 mtime、引用计数查询失败，一律跳过不删。
// @return 实际删掉的文件数。
size_t sweep_orphan_images(int min_age_seconds);
bool can_modify_post(int64_t post_id, int64_t user_id, const std::string& role);

}
