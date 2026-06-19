#pragma once

#include <string>
#include <vector>
#include <boost/json.hpp>

namespace json = boost::json;

// @cuiruoni+通知数据访问对象，封装所有通知相关的数据库操作
namespace notification_dao {

// @cuiruoni+查询用户的通知列表
json::array list_by_user_id(int64_t user_id);

// @cuiruoni+标记单条通知为已读
bool mark_read(int64_t notif_id, int64_t user_id);

// @cuiruoni+标记用户所有通知为已读
bool mark_all_read(int64_t user_id);

// @cuiruoni+删除单条通知
bool delete_by_id(int64_t notif_id, int64_t user_id);

}
