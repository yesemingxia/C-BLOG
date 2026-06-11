#pragma once

#include <string>
#include <vector>
#include <boost/json.hpp>
#include "models/post.h"

namespace json = boost::json;

namespace post_service {

json::object post_to_json(const Post& post);
Post json_to_post(const json::object& obj);
json::array list_posts(int page, int page_size, const std::string& status, int& total);
Post get_post(int64_t id, bool increment_view = true);
void increment_view_count(int64_t id);
int64_t create_post(const Post& post);
bool update_post(int64_t id, const Post& post);
bool delete_post(int64_t id);
bool can_modify_post(int64_t post_id, int64_t user_id, const std::string& role);

}
