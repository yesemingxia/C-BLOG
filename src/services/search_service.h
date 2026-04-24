#pragma once

#include <string>
#include <vector>
#include <boost/json.hpp>

namespace json = boost::json;

namespace search_service {

json::array search(const std::string& keyword);

}
