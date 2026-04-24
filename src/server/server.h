#pragma once

#include <boost/asio/ip/tcp.hpp>
#include <string>
#include <memory>

#include "server/router.h"

namespace net = boost::asio;
using tcp = net::ip::tcp;

class Server {
public:
    Server(const std::string& host, int port, Router& router);

    void run();
    void stop();

private:
    void accept();

    net::io_context ioc_;
    tcp::acceptor acceptor_;
    Router& router_;
    bool running_ = false;
};
