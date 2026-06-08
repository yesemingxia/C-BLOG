#include "server/server.h"
#include "server/session.h"
#include "utils/logger.h"
#include "utils/config.h"

#include <thread>

Server::Server(const std::string& host, int port, Router& router, int threads)
    : ioc_(threads > 1 ? threads : 1), // @cuiruoni+多线程io_context，hint参数优化内部调度
      acceptor_(ioc_, {net::ip::make_address(host), static_cast<unsigned short>(port)}),
      router_(router),
      thread_count_(threads > 0 ? threads : std::thread::hardware_concurrency()) {
    spdlog::info("Server listening on {}:{} ({} threads)", host, port, thread_count_);
}

void Server::run() {
    running_ = true;
    accept();

    // @cuiruoni+多线程模式：创建thread_count_-1个额外线程运行io_context::run()
    // 主线程也运行一个，总共thread_count_个线程处理IO事件
    std::vector<std::thread> threads;
    for (int i = 1; i < thread_count_; ++i) {
        threads.emplace_back([this]() {
            ioc_.run();
        });
    }

    // @cuiruoni+主线程也参与事件循环
    ioc_.run();

    // @cuiruoni+等待所有工作线程结束
    for (auto& t : threads) {
        if (t.joinable()) t.join();
    }
}

void Server::stop() {
    running_ = false;
    beast::error_code ec;
    acceptor_.close(ec);
    ioc_.stop();
}

void Server::accept() {
    // @cuiruoni+异步accept循环：每接受一个连接后递归调用accept()继续监听
    acceptor_.async_accept(
        [this](beast::error_code ec, tcp::socket socket) {
            if (ec) {
                if (running_) {
                    spdlog::warn("Accept error: {}", ec.message());
                    accept(); // @cuiruoni+非致命错误时继续接受新连接
                }
                return;
            }
            spdlog::info("New connection accepted");
            // @cuiruoni+为每个连接创建独立Session，shared_from_this保证生命周期
            std::make_shared<Session>(std::move(socket), router_)->run();
            accept(); // @cuiruoni+递归注册下一次accept，形成持续监听循环
        });
}
