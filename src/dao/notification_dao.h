#pragma once

#include <string>
#include <vector>
#include <boost/json.hpp>

namespace json = boost::json;

// @cuiruoni+通知数据访问对象，封装所有通知相关的数据库操作
namespace notification_dao {

// @cuiruoni+B12：插入通知，post_id/actor_id 可为 0（表示无跳转目标）
bool insert(int64_t user_id, const std::string& type, const std::string& actor_name,
            const std::string& content, const std::string& post_title,
            int64_t post_id = 0, int64_t actor_id = 0);

// @cuiruoni+B12：通知列表分页（倒序），total 为全量条数
json::array list_by_user_id(int64_t user_id, int page, int page_size, int& total);

// @cuiruoni+B12：未读总数跨页统计 —— 只数当前页会让角标随翻页变小
int64_t count_unread(int64_t user_id);

// @cuiruoni+标记单条通知为已读
bool mark_read(int64_t notif_id, int64_t user_id);

// @cuiruoni+标记用户所有通知为已读
bool mark_all_read(int64_t user_id);

// @cuiruoni+删除单条通知
bool delete_by_id(int64_t notif_id, int64_t user_id);

}
