#pragma once

#include <string>

// @cuiruoni+密码工具模块：PBKDF2-HMAC-SHA256加盐哈希+Base64编解码
namespace password {

// @cuiruoni+生成指定长度的随机盐（默认16字节），使用std::random_device
std::string generate_salt(size_t length = 16);
// @cuiruoni+PBKDF2-HMAC-SHA256哈希，iterations=100000次迭代，key_length=32字节输出
std::string hash_password(const std::string& password, const std::string& salt,
                          int iterations = 100000, int key_length = 32);
// @cuiruoni+密码验证：重新计算哈希后与期望值比对
bool verify_password(const std::string& password, const std::string& salt,
                     const std::string& expected_hash);
// @cuiruoni+Base64编码/解码，用于将二进制盐和哈希转为可存储的ASCII字符串
std::string base64_encode(const std::string& input);
std::string base64_decode(const std::string& input);

}
