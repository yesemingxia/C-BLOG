#include "server/server.h"
#include "server/session.h"
#include "utils/logger.h"

Server::Server(const std::string& host, int port, Router& router)
    : ioc_(1),
      acceptor_(ioc_, {net::ip::make_address(host), static_cast<unsigned short>(port)}),
      router_(router) {
    spdlog::info("Server listening on {}:{}", host, port);
}

void Server::run() {
    running_ = true;
    accept();
    ioc_.run();
}

void Server::stop() {
    running_ = false;
    beast::error_code ec;
    acceptor_.close(ec);
    ioc_.stop();
}

void Server::accept() {
    acceptor_.async_accept(
        [this](beast::error_code ec, tcp::socket socket) {
            if (ec) {
                if (running_) {
                    spdlog::warn("Accept error: {}", ec.message());
                }
                return;
            }
            std::make_shared<Session>(std::move(socket), router_)->run();
            accept();
        });
}
