#pragma once

#include <string>
#include <boost/beast/http.hpp>

namespace http = boost::beast::http;

namespace auth_service {

std::string generate_token(int64_t user_id, const std::string& username, const std::string& role);
bool validate_token(const std::string& token, int64_t& user_id, std::string& username, std::string& role);
bool is_token_blacklisted(const std::string& token);
void blacklist_token(const std::string& token, int ttl_seconds);

// @cuiruoni+从HTTP请求Authorization头提取并验证JWT token
bool extract_user_from_token(const http::request<http::string_body>& req,
                             int64_t& user_id, std::string& username, std::string& role);

// @cuiruoni+从HTTP请求Authorization头提取并验证JWT token，同时检查admin角色
bool extract_admin_from_token(const http::request<http::string_body>& req,
                              int64_t& user_id, std::string& username, std::string& role);

}
