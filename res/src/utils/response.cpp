#include "utils/response.h"

// @cuiruoni+统一响应格式实现，输出JSON字符串
namespace response {

std::string success(const json::value& data) {
    json::object obj;
    obj["code"] = 0;      // @cuiruoni+0表示成功
    obj["message"] = "success";
    obj["data"] = data;
    return json::serialize(obj);
}

std::string success(const std::string& message, const json::value& data) {
    json::object obj;
    obj["code"] = 0;
    obj["message"] = message;
    obj["data"] = data;
    return json::serialize(obj);
}

std::string error(int code, const std::string& message) {
    json::object obj;
    obj["code"] = code;   // @cuiruoni+非0错误码，通常与HTTP状态码一致
    obj["message"] = message;
    obj["data"] = json::value{}; // @cuiruoni+错误时data为null
    return json::serialize(obj);
}

}
