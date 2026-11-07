#include "server/session.h"

#include "utils/logger.h"
#include "utils/config.h"
#include "utils/client_ip.h"
#include "middleware/cors_middleware.h"
#include "middleware/rate_limiter.h"

#include <array>
#include <chrono>
#include <string>
#include <thread>

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
                res.set(http::field::connection, "close");
                res.body() = R"({"code":413,"message":"Request body too large","data":null})";
                res.prepare_payload();
                self->res_ = std::move(res);
                self->keep_alive_ = false;
                self->write_payload_too_large();
                return;
            }

            // @crnl+F3：chunked 请求没有 Content-Length，上面的 declared 检查拦不住，
            // 会一路塞到解析层 64MB 兜底。把解析层限额收紧到路径 cap：
            // 超限时 beast 报 http::error::body_limit，由 body 读取回调回 413。
            self->parser_->body_limit(cap);

            http::async_read(self->stream_, self->buffer_, *self->parser_,
                [self](beast::error_code ec2, std::size_t bytes2) {
                    if (!ec2) {
                        self->req_ = self->parser_->get();
                        self->handle_request();
                    } else if (ec2 == http::error::body_limit) {
                        // @crnl+F3：chunked body 超过路径限额，明确回 413 而不是静默断连
                        spdlog::warn("Chunked body exceeded path cap: {}",
                                     std::string(self->req_.target()));
                        http::response<http::string_body> res{http::status::payload_too_large,
                                                              self->req_.version()};
                        res.set(http::field::content_type, "application/json");
                        res.set(http::field::connection, "close");
                        res.body() = R"({"code":413,"message":"Request body too large","data":null})";
                        res.prepare_payload();
                        self->res_ = std::move(res);
                        self->keep_alive_ = false;
                        self->write_payload_too_large();
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
        // @cuiruoni+安全：X-Real-IP / X-Client-IP 客户端都能自带，默认不认账；
        // @cuiruoni+这里算出的唯一口径会**覆盖**写进 X-Client-IP，下游（限流、浏览量去重）只读它
        beast::error_code ec;
        auto remote = stream_.socket().remote_endpoint(ec);
        std::string peer_ip = ec ? std::string() : remote.address().to_string();
        auto real_it = req_.find("X-Real-IP");
        std::string real_ip_value = real_it == req_.end() ? std::string() : std::string(real_it->value());
        req_.set("X-Client-IP", client_ip::resolve(
            real_ip_value, peer_ip, Config::instance().trust_proxy_real_ip()));

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

        // @cuiruoni+安全：统一用上面归一好的 X-Client-IP，不再各自决定信哪个头
        std::string rate_limit_ip = req_.find("X-Client-IP") != req_.end()
            ? std::string(req_["X-Client-IP"]) : std::string("unknown");
        if (!rate_limiter::check(rate_limit_ip, endpoint)) {
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

        // @cuiruoni+B10：先尝试文件路由（视频 Range/HEAD）。文件响应不经过
        // @cuiruoni+route_request 的 JSON 合并逻辑，避免把 file_body 搬进 string_body。
        file_result_ = FileRouteResult{};
        if (router_.route_file_request(req_, file_result_)) {
            if (file_result_.is_file) {
                auto& file_res = file_result_.file;
                file_res.version(req_.version());
                file_res.set(http::field::server, "cpp-blog/0.1.0");
                cors_middleware::apply_cors(req_, file_res);
                file_res.keep_alive(keep_alive_);
                file_res.prepare_payload();
                write_file_response();
                return;
            }

            // 错误/HEAD 走普通字符串响应；handler 已设置好 Content-Length（HEAD 场景）
            res_ = std::move(file_result_.text);
            res_.set(http::field::server, "cpp-blog/0.1.0");
            cors_middleware::apply_cors(req_, res_);
            res_.keep_alive(keep_alive_);
            write_response();
            return;
        }

        router_.route_request(req_, res_);

        // @cuiruoni+统一设置响应头，CORS头已由cors_middleware正确设置，此处不再覆盖
        // @cuiruoni+仅在 handler 未声明 Content-Type 时回退为 JSON：
        // 图片/视频接口自行设置了 image/*、video/*，无条件覆盖会让浏览器按 JSON 处理媒体
        if (res_.find(http::field::content_type) == res_.end()) {
            res_.set(http::field::content_type, "application/json");
        }
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

// @cuiruoni+B10：文件响应异步写。file_result_ 是成员，保证文件句柄活到写完成。
void Session::write_file_response() {
    auto self = shared_from_this();
    http::async_write(stream_, file_result_.file,
        [self](beast::error_code ec, std::size_t) {
            if (ec) {
                spdlog::warn("Write file response error: {}", ec.message());
                self->close();
                return;
            }
            if (self->keep_alive_) {
                self->read_request();
            } else {
                self->close();
            }
        });
}

void Session::close() {
    beast::error_code ec;
    stream_.socket().shutdown(tcp::socket::shutdown_send, ec);
}

// @crnl+F3：413 响应写完后先排空对端已发出、内核里还躺着的入站数据，再关连接。
// 直接 close 一个带未读数据的 socket，Windows 会回 RST，把刚写的 413 一起冲掉
void Session::write_payload_too_large() {
    auto self = shared_from_this();
    http::async_write(stream_, res_,
        [self](beast::error_code ec, std::size_t) {
            if (ec) {
                self->close();
                return;
            }
            self->drain_and_close();
        });
}

void Session::drain_and_close() {
    auto self = shared_from_this();
    std::array<char, 4096> buf{};
    auto& sock = stream_.socket();
    beast::error_code ec;
    sock.non_blocking(true, ec);

    // 有界 drain：最多 8MB / 300ms，避免恶意客户端持续灌数据占住 IO 线程。
    // 正常客户端（一次性 sendall）在几十毫秒内就能读完，随后收到 FIN
    size_t total = 0;
    const auto deadline = std::chrono::steady_clock::now() + std::chrono::milliseconds(300);
    while (std::chrono::steady_clock::now() < deadline && total < 8 * 1024 * 1024) {
        size_t n = sock.read_some(net::buffer(buf), ec);
        if (n > 0) total += n;
        if (ec == net::error::would_block || ec == net::error::try_again) {
            ec.clear();
            std::this_thread::sleep_for(std::chrono::milliseconds(2));
            continue;
        }
        if (ec) break; // eof / reset / 其他错误
    }
    spdlog::debug("413 drain: {} bytes discarded before close", total);
    close();
}
