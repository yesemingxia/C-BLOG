#include "server/session.h"

#include "utils/logger.h"
#include "utils/config.h"
#include "middleware/cors_middleware.h"
#include "middleware/rate_limiter.h"

Session::Session(tcp::socket&& socket, Router& router)
    : stream_(std::move(socket)), router_(router) {
    spdlog::info("Session created");
}

void Session::run() {
    spdlog::info("Session::run() called");
    read_request();
}

void Session::read_request() {
    // @cuiruoni+每次读取新请求前重置请求对象，避免残留数据
    req_ = http::request<http::string_body>{};
    req_.body().reserve(Config::instance().max_request_body_bytes());

    auto self = shared_from_this();
    http::async_read(stream_, buffer_, req_,
        [self](beast::error_code ec, std::size_t bytes) {
            if (!ec) {
                // @cuiruoni+检查请求体是否超过大小限制
                auto max_bytes = Config::instance().max_request_body_bytes();
                if (bytes > static_cast<std::size_t>(max_bytes)) {
                    spdlog::warn("Request body too large: {} bytes (max: {})", bytes, max_bytes);
                    http::response<http::string_body> res{http::status::payload_too_large, self->req_.version()};
                    res.set(http::field::content_type, "application/json");
                    res.body() = R"({"code":413,"message":"Request body too large","data":null})";
                    res.prepare_payload();
                    self->res_ = std::move(res);
                    self->keep_alive_ = false;
                    self->write_response();
                    return;
                }
                self->handle_request();
            } else if (ec == http::error::end_of_stream) {
                // @cuiruoni+客户端正常关闭连接
                self->close();
            } else {
                spdlog::warn("Read error: {} ({} bytes)", ec.message(), bytes);
                self->close();
            }
        });
}

void Session::handle_request() {
    try {
        // @cuiruoni+判断客户端是否请求Keep-Alive
        keep_alive_ = req_.keep_alive();

        res_ = http::response<http::string_body>{};
        res_.version(req_.version());
        res_.set(http::field::server, "cpp-blog/0.1.0");

        // @cuiruoni+先执行CORS中间件，为响应添加跨域头
        cors_middleware::cors_handle_request(req_, res_);

        std::string target(req_.target());
        spdlog::info("{} {}", req_.method_string(), target);

        // @cuiruoni+请求频率限制：根据路径确定限流策略
        std::string endpoint = "default";
        std::string path = target.substr(0, target.find('?')); // @cuiruoni+去掉查询字符串
        if (path == "/api/auth/login") endpoint = "login";
        else if (path == "/api/auth/register") endpoint = "register";
        else if (path.find("/api/posts/") != std::string::npos && path.find("/comments") != std::string::npos) endpoint = "comment";

        std::string client_ip = req_.find("X-Forwarded-For") != req_.end()
            ? std::string(req_["X-Forwarded-For"]) : "unknown";
        if (!rate_limiter::check(client_ip, endpoint)) {
            res_.result(http::status::too_many_requests);
            res_.set(http::field::content_type, "application/json");
            res_.body() = R"({"code":429,"message":"Too many requests, please try again later","data":null})";
            res_.keep_alive(keep_alive_);
            res_.prepare_payload();
            write_response();
            return;
        }

        // @cuiruoni+路由分发：中间件链→路径匹配→handler执行
        router_.route_request(req_, res_);

        // @cuiruoni+统一设置响应头，CORS头已由cors_middleware正确设置，此处不再覆盖
        res_.set(http::field::content_type, "application/json");
        // @cuiruoni+根据keep_alive_状态设置Connection头
        res_.keep_alive(keep_alive_);
        res_.prepare_payload();

        write_response();
    } catch (const std::exception& e) {
        // @cuiruoni+兜底异常处理，返回统一500响应，防止未捕获异常导致连接泄漏
        spdlog::error("Handle request error: {}", e.what());
        res_ = http::response<http::string_body>{http::status::internal_server_error, req_.version()};
        res_.set(http::field::content_type, "application/json");
        res_.body() = R"({"code":500,"message":"Internal Server Error","data":null})";
        // @cuiruoni+异常路径也需要CORS头，使用cors_middleware统一处理
        cors_middleware::cors_handle_request(req_, res_);
        keep_alive_ = false; // @cuiruoni+异常时关闭连接
        res_.keep_alive(false);
        res_.prepare_payload();
        write_response();
    }
}

void Session::write_response() {
    auto self = shared_from_this();
    http::async_write(stream_, res_,
        [self](beast::error_code ec, std::size_t) {
            if (ec) {
                spdlog::warn("Write error: {}", ec.message());
                self->close();
                return;
            }
            if (self->keep_alive_) {
                // @cuiruoni+Keep-Alive：复用连接，继续读取下一个请求
                spdlog::debug("Connection keep-alive, reading next request");
                self->read_request();
            } else {
                // @cuiruoni+短连接：响应完成后关闭连接
                self->close();
            }
        });
}

void Session::close() {
    beast::error_code ec;
    stream_.socket().shutdown(tcp::socket::shutdown_send, ec);
}
