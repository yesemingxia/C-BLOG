#pragma once

#include <boost/json.hpp>
#include <string>

namespace json = boost::json;

// @cuiruoni+统一响应格式工具，所有API返回统一的JSON结构：{code, message, data}
// @cuiruoni+code=0表示成功，非0表示错误（与HTTP状态码对应）
namespace response {

// @cuiruoni+成功响应，code=0，data为任意JSON值
std::string success(const json::value& data = json::object{});
// @cuiruoni+成功响应，自定义message
std::string success(const std::string& message, const json::value& data = json::object{});
// @cuiruoni+错误响应，code为错误码，data为null
std::string error(int code, const std::string& message);

}
