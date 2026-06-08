#pragma once

#include <string>

// @cuiruoni+请求频率限制：基于Redis的滑动窗口算法，按IP限流
namespace rate_limiter {

// @cuiruoni+检查请求是否超过频率限制
// @param client_ip 客户端IP地址
// @param endpoint 端点标识（如"login"、"register"），用于区分不同接口的限流策略
// @return true=允许请求，false=超过限制应拒绝
bool check(const std::string& client_ip, const std::string& endpoint = "default");

}
