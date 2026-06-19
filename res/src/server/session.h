#pragma once

#include <boost/beast/core.hpp>
#include <boost/beast/http.hpp>
#include <boost/asio/ip/tcp.hpp>
#include <memory>
#include <string>

#include "server/router.h"

namespace beast = boost::beast;
namespace http = beast::http;
namespace net = boost::asio;
using tcp = net::ip::tcp;

// @cuiruoni+HTTP会话类，处理单个TCP连接的完整生命周期：读取请求→CORS处理→路由分发→写入响应
// @cuiruoni+支持HTTP Keep-Alive：根据请求Connection头决定是否复用连接
// @cuiruoni+继承enable_shared_from_this，确保异步回调中Session不会被提前销毁
class Session : public std::enable_shared_from_this<Session> {
public:
    explicit Session(tcp::socket&& socket, Router& router);

    void run();

private:
    void read_request();
    void handle_request();
    void write_response();
    void close();

    beast::tcp_stream stream_;                   // @cuiruoni+TCP流，封装socket支持超时等特性
    beast::flat_buffer buffer_;                   // @cuiruoni+扁平缓冲区，存储原始请求字节
    http::request<http::string_body> req_;        // @cuiruoni+当前请求对象
    http::response<http::string_body> res_;       // @cuiruoni+当前响应对象
    Router& router_;                              // @cuiruoni+路由器引用，用于请求分发
    bool keep_alive_ = false;                     // @cuiruoni+是否保持连接复用
};
