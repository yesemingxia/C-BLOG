#pragma once

#include <string>
#include <boost/json.hpp>

namespace json = boost::json;

// @cuiruoni+视频投稿 DAO：用户上传的背景视频，管理员审核通过后可「启用」唯一一支作为主页背景
namespace video_dao {

struct VideoRow {
    int64_t id = 0;
    int64_t uploader_id = 0;
    std::string uploader_name;
    std::string filename;
    std::string original_name;
    std::string status;      // pending | approved | rejected
    bool is_active = false;  // 当前主页背景（全局唯一）
    std::string created_at;
};

// @cuiruoni+新增投稿记录（status=pending）
bool insert(int64_t uploader_id, const std::string& filename, const std::string& original_name, int64_t& out_id);

// @cuiruoni+按状态分页列出（管理员审核用），带投稿人用户名
json::array list_by_status(const std::string& status, int page, int page_size, int& total);

// @cuiruoni+当前启用的那支视频（全局唯一），没有返回 json::object{} 空对象
json::object get_active();

// @cuiruoni+某用户自己的投稿
json::array list_by_uploader(int64_t uploader_id);

// @cuiruoni+按 id 取单行；不存在返回 false
bool get(int64_t id, VideoRow& out);

// @cuiruoni+审核：更新状态并记录时间
bool set_status(int64_t id, const std::string& status);

// @cuiruoni+启用：清掉其他所有 is_active，只保留 id 这一支（先决条件：已 approved）
bool set_active(int64_t id);

// @cuiruoni+停用（is_active 置 0）
bool deactivate(int64_t id);

// @cuiruoni+删除记录（文件删除由调用方处理）
bool delete_by_id(int64_t id);

}
