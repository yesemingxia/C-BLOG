#pragma once

#include <string>

namespace auth_service {

std::string generate_token(int64_t user_id, const std::string& username, const std::string& role);
bool validate_token(const std::string& token, int64_t& user_id, std::string& username, std::string& role);
bool is_token_blacklisted(const std::string& token);
void blacklist_token(const std::string& token, int ttl_seconds);

}
