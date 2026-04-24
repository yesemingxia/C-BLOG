#pragma once

#include <boost/json.hpp>
#include <string>

namespace json = boost::json;

namespace response {

std::string success(const json::value& data = json::object{});
std::string success(const std::string& message, const json::value& data = json::object{});
std::string error(int code, const std::string& message);

}
