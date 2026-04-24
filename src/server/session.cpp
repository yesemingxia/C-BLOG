#include "server/session.h"

#include "utils/logger.h"
#include "middleware/cors_middleware.h"

Session::Session(tcp::socket&& socket, Router& router)
    : stream_(std::move(socket)), router_(router) {}

void Session::run() {
    read_request();
}

void Session::read_request() {
    auto self = shared_from_this();
    http::async_read(stream_, buffer_, req_,
        [self](beast::error_code ec, std::size_t) {
            if (!ec) {
                self->handle_request();
            } else {
                spdlog::warn("Read error: {}", ec.message());
            }
        });
}

void Session::handle_request() {
    res_.version(req_.version());
    res_.set(http::field::server, "cpp-blog/0.1.0");

    cors_handle_request(req_, res_);

    router_.route_request(req_, res_);

    res_.set(http::field::content_type, "application/json");
    if (res_.find(http::field::access_control_allow_origin) == res_.end()) {
    }
    res_.prepare_payload();

    write_response();
}

void Session::write_response() {
    auto self = shared_from_this();
    http::async_write(stream_, res_,
        [self](beast::error_code ec, std::size_t) {
            if (ec) {
                spdlog::warn("Write error: {}", ec.message());
            }
            self->close();
        });
}

void Session::close() {
    auto self = shared_from_this();
    beast::error_code ec;
    stream_.socket().shutdown(tcp::socket::shutdown_send, ec);
}
