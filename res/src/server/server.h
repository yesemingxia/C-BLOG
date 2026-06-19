#pragma once

#include <boost/asio/ip/tcp.hpp>
#include <atomic>
#include <string>
#include <memory>
#include <vector>

#include "server/router.h"

namespace net = boost::asio;
using tcp = net::ip::tcp;

// @cuiruoni+异步TCP服务器，基于Boost.Asio实现accept循环，每个连接创建Session处理
class Server {
public:
    Server(const std::string& host, int port, Router& router, int threads = 1);

    void run();
    void stop();

private:
    // @cuiruoni+异步accept新连接，递归调用自身实现持续监听
    void accept();

    net::io_context ioc_;       // @cuiruoni+io_context，多线程时共享
    tcp::acceptor acceptor_;    // @cuiruoni+TCP连接接收器
    Router& router_;            // @cuiruoni+路由器引用，不拥有所有权
    int thread_count_;          // @cuiruoni+工作线程数，0表示自动检测CPU核心数
    std::atomic<bool> running_{false}; // @cuiruoni+原子布尔，保证stop()和accept回调间的线程安全
};
