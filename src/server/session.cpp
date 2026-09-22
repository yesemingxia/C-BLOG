#include "server/session.h"

#include "utils/logger.h"
#include "utils/config.h"
#include "middleware/cors_middleware.h"
#include "middleware/rate_limiter.h"

#include <string>

Session::Session(tcp::socket&& socket, Router& router)
    : stream_(std::move(socket)), router_(router) {
    spdlog::debug("Session created");
}

void Session::run() {
    spdlog::debug("Session::run() called");
    read_request();
}

void Session::read_request() {
    // @cuiruoni+每次读取新请求前重置请求对象和解析器，避免残留数据
    req_ = http::request<http::string_body>{};
    parser_ = std::make_unique<http::request_parser<http::string_body>>();
    // @cuiruoni+P0修复：解析层必须放宽（64MB）—— beast 对带 Content-Length 的请求
    // @cuiruoni+会在**解析头部时**就按当时的限额校验，头部之后才调 body_limit 为时已晚。
    // @cuiruoni+真正的按路径限额在下面读到头部后人工执行（见 enforce_body_cap）。
    parser_->body_limit(64 * 1024 * 1024);

    auto self = shared_from_this();
    http::async_read_header(stream_, buffer_, *parser_,
        [self](beast::error_code ec, std::size_t) {
            if (ec) {
                if (ec == http::error::end_of_stream) {
                    self->close();
                } else {
                    spdlog::warn("Read header error: {}", ec.message());
                    self->close();
                }
                return;
            }

            self->req_ = self->parser_->get();
            std::string target(self->req_.target());
            std::string path = target.substr(0, target.find('?'));

            // @cuiruoni+按路径的 body 限额（超过即 413）：
            //   图片上传（base64）12MB / 视频分片 3MB / 其余 1MB。
            // @cuiruoni+防 DoS 语义不变：解析层 64MB 兜底 + 每条路径白名单放大。
            size_t declared = 0;
            auto cl = self->req_.find(http::field::content_length);
            if (cl != self->req_.end()) {
                declared = static_cast<size_t>(std::stoull(std::string(cl->value())));
            }
            size_t cap = 1024 * 1024; // 默认 1MB
            std::string method(self->req_.method_string());
            if (path == "/api/upload/image") {
                cap = 12 * 1024 * 1024;
            } else if (path.find("/api/videos/upload/") == 0 && method == "PUT") {
                cap = 3 * 1024 * 1024; // 视频分片：单片 1MB（最大 2MB）+ 余量
            }
            if (declared > cap) {
                spdlog::warn("Request body too large ({} > cap {}): {}", declared, cap, path);
                http::response<http::string_body> res{http::status::payload_too_large,
                                                      self->req_.version()};
                res.set(http::field::content_type, "application/json");
                res.body() = R"({"code":413,"message":"Request body too large","data":null})";
                res.prepare_payload();
                self->res_ = std::move(res);
                self->keep_alive_ = false;
                self->write_response();
                return;
            }

            http::async_read(self->stream_, self->buffer_, *self->parser_,
                [self](beast::error_code ec2, std::size_t bytes2) {
                    if (!ec2) {
                        self->req_ = self->parser_->get();
                        self->handle_request();
                    } else if (ec2 == http::error::end_of_stream) {
                        // @cuiruoni+客户端正常关闭连接
                        self->close();
                    } else {
                        spdlog::warn("Read body error: {} ({} bytes)", ec2.message(), bytes2);
                        self->close();
                    }
                });
        });
}

void Session::handle_request() {
    try {
        // @cuiruoni+判断客户端是否请求Keep-Alive
        keep_alive_ = req_.keep_alive();

        res_ = http::response<http::string_body>{};
        res_.version(req_.version());
        res_.set(http::field::server, "cpp-blog/0.1.0");

        // @cuiruoni+P1修复：无反向代理时回退到TCP对端地址作为客户端IP，
        // 避免开发环境所有请求共用"unknown"限流桶/浏览量去重键
        if (req_.find("X-Real-IP") == req_.end()) {
            beast::error_code ec;
            auto remote = stream_.socket().remote_endpoint(ec);
            if (!ec) {
                req_.set("X-Client-IP", remote.address().to_string());
            }
        }

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
        else if (path == "/api/contact") endpoint = "contact";

        // @cuiruoni+优先使用X-Real-IP（Nginx设置），回退X-Client-IP（本机直连时由Session写入）
        std::string client_ip = req_.find("X-Real-IP") != req_.end()
            ? std::string(req_["X-Real-IP"])
            : (req_.find("X-Client-IP") != req_.end() ? std::string(req_["X-Client-IP"]) : "unknown");
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
        // @cuiruoni+OPTIONS预检请求直接返回200，CORS头已由cors_middleware设置
        if (req_.method() == http::verb::options) {
            res_.result(http::status::ok);
            res_.set(http::field::content_type, "application/json");
            res_.body() = "{}";
            res_.keep_alive(keep_alive_);
            res_.prepare_payload();
            write_response();
            return;
        }

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
