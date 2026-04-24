#pragma once

#include <string>

namespace password {

std::string generate_salt(size_t length = 16);
std::string hash_password(const std::string& password, const std::string& salt,
                          int iterations = 100000, int key_length = 32);
bool verify_password(const std::string& password, const std::string& salt,
                     const std::string& expected_hash);
std::string base64_encode(const std::string& input);
std::string base64_decode(const std::string& input);

}
