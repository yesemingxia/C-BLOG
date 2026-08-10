#include "utils/http_client.h"

#include "utils/config.h"
#include "utils/logger.h"

#include <boost/asio/connect.hpp>
#include <boost/asio/ip/tcp.hpp>
#include <boost/asio/ssl.hpp>
#include <boost/beast/core.hpp>
#include <boost/beast/http.hpp>
#include <boost/beast/ssl.hpp>
#include <boost/beast/ssl/ssl_stream.hpp>
#include <boost/beast/version.hpp>

#include <openssl/ssl.h>
#include <openssl/x509.h>
#include <openssl/x509_vfy.h>

#include <chrono>
#include <cstring>
#include <stdexcept>

#ifdef _WIN32
#include <wincrypt.h>
#endif

namespace http = boost::beast::http;
namespace beast = boost::beast;
namespace asio = boost::asio;
namespace ssl = boost::asio::ssl;
using tcp = boost::asio::ip::tcp;

namespace http_client {

#ifdef _WIN32
// @cuiruoni+加载 Windows 系统根证书到 SSL_CTX 证书库
// @cuiruoni+OpenSSL 在 Windows 上无默认 CA 路径，必须显式从证书存储导入
static bool load_windows_root_certs(SSL_CTX* ssl_ctx) {
    if (!ssl_ctx) return false;
    HCERTSTORE store = CertOpenSystemStoreW(0, L"ROOT");
    if (!store) return false;

    X509_STORE* x509_store = SSL_CTX_get_cert_store(ssl_ctx);
    if (!x509_store) {
        CertCloseStore(store, 0);
        return false;
    }

    bool loaded_any = false;
    PCCERT_CONTEXT cert_ctx = nullptr;
    while ((cert_ctx = CertEnumCertificatesInStore(store, cert_ctx)) != nullptr) {
        const unsigned char* p = cert_ctx->pbCertEncoded;
        X509* x = d2i_X509(nullptr, &p, cert_ctx->cbCertEncoded);
        if (x) {
            if (X509_STORE_add_cert(x509_store, x) == 1) {
                loaded_any = true;
            }
            X509_free(x);
        }
    }
    if (cert_ctx) CertFreeCertificateContext(cert_ctx);
    CertCloseStore(store, 0);
    return loaded_any;
}
#endif

// @cuiruoni+解析 URL 为 host/port/target，支持 https 与 http
static bool parse_url(const std::string& url, bool& is_ssl,
                      std::string& host, std::string& port, std::string& target) {
    std::string rest;
    if (url.rfind("https://", 0) == 0) {
        is_ssl = true;
        port = "443";
        rest = url.substr(8);
    } else if (url.rfind("http://", 0) == 0) {
        is_ssl = false;
        port = "80";
        rest = url.substr(7);
    } else {
        return false;
    }

    auto slash = rest.find('/');
    if (slash == std::string::npos) {
        host = rest;
        target = "/";
    } else {
        host = rest.substr(0, slash);
        target = rest.substr(slash);
    }

    // @cuiruoni+分离显式端口（host:port）
    auto colon = host.find(':');
    if (colon != std::string::npos) {
        port = host.substr(colon + 1);
        host = host.substr(0, colon);
    }
    return !host.empty();
}

// @cuiruoni+构造 HTTP 请求（GET 无 body，POST 带 JSON body）
static http::request<http::string_body> make_request(
    const std::string& method, const std::string& target, const std::string& host,
    const std::string& body, const std::map<std::string, std::string>& headers) {
    http::request<http::string_body> req;
    req.method(method == "POST" ? http::verb::post : http::verb::get);
    req.target(target);
    req.version(11);
    req.set(http::field::host, host);
    req.set(http::field::user_agent, "cpp-blog-style-service/1.0");
    req.set(http::field::accept, "*/*");
    for (const auto& [k, v] : headers) req.set(k, v);
    if (method == "POST") {
        req.body() = body;
        req.prepare_payload();
    }
    return req;
}

static Response perform(const std::string& method, const std::string& url,
                        const std::string& body,
                        const std::map<std::string, std::string>& headers,
                        int timeout_seconds) {
    Response resp;
    try {
        bool is_ssl = false;
        std::string host, port, target;
        if (!parse_url(url, is_ssl, host, port, target)) {
            resp.body = "http_client: invalid url: " + url;
            return resp;
        }

        asio::io_context ioc;

        if (!is_ssl) {
            // @cuiruoni+纯 HTTP（下载结果图可能为 http）
            beast::tcp_stream stream(ioc);
            tcp::resolver resolver(ioc);
            auto results = resolver.resolve(host, port);
            stream.expires_after(std::chrono::seconds(timeout_seconds));
            stream.connect(results);
            // @cuiruoni+connect 会消耗超时，完成后重新设置读写超时（与 HTTPS 分支一致）
            stream.expires_after(std::chrono::seconds(timeout_seconds));

            http::write(stream, make_request(method, target, host, body, headers));

            beast::flat_buffer buffer;
            http::response<http::string_body> res;
            http::read(stream, buffer, res);
            resp.status = res.result_int();
            resp.body = res.body();
            return resp;
        }

        // @cuiruoni+HTTPS 路径（asio::ssl）。verify=true 时校验对端证书，
        // @cuiruoni+防止 MITM 窃取 Authorization 头中的 API Key。
        auto do_ssl = [&](bool verify) -> Response {
            Response r;
            try {
                ssl::context ctx(ssl::context::tls_client);
                if (verify) {
                    ctx.set_verify_mode(ssl::verify_peer);
                    // @cuiruoni+默认 CA 路径（Linux/macOS）；Windows 下无效，随后从系统证书存储导入
                    beast::error_code cert_ec;
                    ctx.set_default_verify_paths(cert_ec);
#ifdef _WIN32
                    load_windows_root_certs(ctx.native_handle());
#endif
                } else {
                    ctx.set_verify_mode(ssl::verify_none);
                }

                beast::ssl_stream<beast::tcp_stream> stream(ioc, ctx);
                if (!SSL_set_tlsext_host_name(stream.native_handle(), host.c_str())) {
                    r.body = "http_client: SSL_set_tlsext_host_name failed";
                    return r;
                }
                // @cuiruoni+校验对端证书的 CN/SAN 与请求主机名一致（verify_peer 只验链不验域名）
                if (SSL_set1_host(stream.native_handle(), host.c_str()) != 1) {
                    r.body = "http_client: SSL_set1_host failed";
                    return r;
                }

                tcp::resolver resolver(ioc);
                auto results = resolver.resolve(host, port);
                beast::get_lowest_layer(stream).expires_after(std::chrono::seconds(timeout_seconds));
                beast::get_lowest_layer(stream).connect(results);
                stream.handshake(ssl::stream_base::client);
                // @cuiruoni+connect/handshake 会消耗超时，完成后重新设置读写超时
                beast::get_lowest_layer(stream).expires_after(std::chrono::seconds(timeout_seconds));

                http::write(stream, make_request(method, target, host, body, headers));

                beast::flat_buffer buffer;
                http::response<http::string_body> res;
                http::read(stream, buffer, res);
                r.status = res.result_int();
                r.body = res.body();

                beast::error_code ec;
                stream.shutdown(ec); // @cuiruoni+忽略关闭错误（服务端可能先断开）
            } catch (const std::exception& e) {
                r.status = 0;
                r.body = std::string("http_client: ") + e.what();
            }
            return r;
        };

        resp = do_ssl(true);

        // @cuiruoni+证书校验失败时的降级策略：仅当显式配置
        // @cuiruoni+dashscope_allow_insecure_tls=true 且错误确为证书类问题时重试一次。
        // @cuiruoni+默认安全（不降级），避免 API Key 被中间人窃取。
        if (resp.status == 0 && !resp.body.empty()) {
            const std::string& err = resp.body;
            bool cert_issue = err.find("certificate") != std::string::npos ||
                              err.find("verify") != std::string::npos ||
                              err.find("handshake") != std::string::npos;
            if (cert_issue && Config::instance().get_bool("dashscope_allow_insecure_tls", false)) {
                spdlog::warn("[http_client] TLS verification failed ({}), retrying without verification per config",
                             err);
                resp = do_ssl(false);
            }
        }
    } catch (const std::exception& e) {
        resp.status = 0;
        resp.body = std::string("http_client: ") + e.what();
    }
    return resp;
}

Response post_json(const std::string& url, const std::string& body,
                   const std::map<std::string, std::string>& headers,
                   int timeout_seconds) {
    return perform("POST", url, body, headers, timeout_seconds);
}

Response get(const std::string& url,
             const std::map<std::string, std::string>& headers,
             int timeout_seconds) {
    return perform("GET", url, "", headers, timeout_seconds);
}

}
