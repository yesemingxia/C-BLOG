#include "utils/password.h"

#include <openssl/evp.h>
#include <random>
#include <vector>

namespace password {

std::string generate_salt(size_t length) {
    std::vector<unsigned char> salt(length);
    std::random_device rd;
    std::generate(salt.begin(), salt.end(), [&]() { return rd() & 0xFF; });
    return std::string(salt.begin(), salt.end());
}

std::string hash_password(const std::string& password, const std::string& salt,
                          int iterations, int key_length) {
    std::vector<unsigned char> key(key_length);
    PKCS5_PBKDF2_HMAC(password.c_str(), static_cast<int>(password.size()),
                       reinterpret_cast<const unsigned char*>(salt.c_str()),
                       static_cast<int>(salt.size()),
                       iterations, EVP_sha256(), key_length, key.data());
    return std::string(key.begin(), key.end());
}

bool verify_password(const std::string& password, const std::string& salt,
                     const std::string& expected_hash) {
    return hash_password(password, salt) == expected_hash;
}

static const char kBase64Chars[] =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    "abcdefghijklmnopqrstuvwxyz"
    "0123456789+/";

std::string base64_encode(const std::string& input) {
    std::string output;
    int val = 0;
    int valb = -6;
    for (unsigned char c : input) {
        val = (val << 8) + c;
        valb += 8;
        while (valb >= 0) {
            output.push_back(kBase64Chars[(val >> valb) & 0x3F]);
            valb -= 6;
        }
    }
    if (valb > -6) {
        output.push_back(kBase64Chars[((val << 8) >> (valb + 8)) & 0x3F]);
    }
    while (output.size() % 4 != 0) {
        output.push_back('=');
    }
    return output;
}

std::string base64_decode(const std::string& input) {
    std::vector<int> t(256, -1);
    for (int i = 0; i < 64; i++) {
        t[static_cast<unsigned char>(kBase64Chars[i])] = i;
    }
    std::string output;
    int val = 0;
    int valb = -8;
    for (unsigned char c : input) {
        if (c == '=') break;
        if (t[c] == -1) continue;
        val = (val << 6) + t[c];
        valb += 6;
        if (valb >= 0) {
            output.push_back(static_cast<char>((val >> valb) & 0xFF));
            valb -= 8;
        }
    }
    return output;
}

}
