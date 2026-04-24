#include "utils/response.h"

namespace response {

std::string success(const json::value& data) {
    json::object obj;
    obj["code"] = 0;
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
    obj["code"] = code;
    obj["message"] = message;
    obj["data"] = json::value{};
    return json::serialize(obj);
}

}
