#pragma once

#include <string>
#include <boost/beast/http.hpp>

namespace http = boost::beast::http;

namespace auth_service {

std::string generate_token(int64_t user_id, const std::string& username, const std::string& role);
bool validate_token(const std::string& token, int64_t& user_id, std::string& username, std::string& role);
bool is_token_blacklisted(const std::string& token);
void blacklist_token(const std::string& token, int ttl_seconds);

// @cuiruoni+P2修复：从Authorization头或HttpOnly Cookie（blog_token）中提取JWT
std::string extract_token_from_request(const http::request<http::string_body>& req);

// @cuiruoni+从HTTP请求中提取并验证JWT token（兼容Authorization头和Cookie）
bool extract_user_from_token(const http::request<http::string_body>& req,
                             int64_t& user_id, std::string& username, std::string& role);

// @cuiruoni+从HTTP请求中提取并验证JWT token，同时检查admin角色
bool extract_admin_from_token(const http::request<http::string_body>& req,
                              int64_t& user_id, std::string& username, std::string& role);

// @cuiruoni+记录登录失败次数（两层：按 用户名+客户端IP、按 用户名），达到阈值即锁定
// @cuiruoni+client_ip 必须是 Session 归一后的 X-Client-IP，不能是客户端自带的 X-Real-IP，
// @cuiruoni+否则攻击者换个头就等于换个桶，锁定形同不存在
void record_login_failure(const std::string& username, const std::string& client_ip);

// @cuiruoni+是否已锁定（任一层达到阈值即 true）
bool is_account_locked(const std::string& username, const std::string& client_ip);

// @cuiruoni+登录成功后清除该 用户名(+本IP) 的失败计数
void clear_login_failures(const std::string& username, const std::string& client_ip);

}
