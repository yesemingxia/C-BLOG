#pragma once

#include <map>
#include <string>

// @cuiruoni+最小 HTTPS/HTTP 同步客户端（Boost.Beast + asio::ssl）
// @cuiruoni+用于风格服务调用外部图像生成 API（DashScope）与下载生成图
// @cuiruoni+同步阻塞式设计，仅用于后台工作线程，禁止在 IO 线程调用
namespace http_client {

struct Response {
    int status = 0;      // @cuiruoni+HTTP 状态码，0 表示网络/解析错误
    std::string body;    // @cuiruoni+响应体（文本或原始字节）
};

// @cuiruoni+POST JSON 请求，返回响应
// @cuiruoni+headers 为额外请求头（如 Authorization），Content-Type 需自行设置
Response post_json(const std::string& url, const std::string& body,
                   const std::map<std::string, std::string>& headers = {},
                   int timeout_seconds = 60);

// @cuiruoni+GET 请求（用于任务轮询与图片下载），返回响应
Response get(const std::string& url,
             const std::map<std::string, std::string>& headers = {},
             int timeout_seconds = 60);

}
