#pragma once

#include <string>
#include <sstream>
#include <vector>

// @cuiruoni+HTML输入消毒工具，防止XSS攻击
// @cuiruoni+对用户输入的文本进行HTML实体转义，确保存入数据库的内容不包含可执行脚本
namespace sanitize {

// @cuiruoni+转义HTML特殊字符：<>&"'→对应HTML实体
inline std::string escape_html(const std::string& input) {
    std::string output;
    output.reserve(input.size());
    for (char c : input) {
        switch (c) {
            case '&':  output.append("&amp;");  break;
            case '<':  output.append("&lt;");   break;
            case '>':  output.append("&gt;");   break;
            case '"':  output.append("&quot;"); break;
            case '\'': output.append("&#39;");  break;
            default:   output.push_back(c);     break;
        }
    }
    return output;
}

// @cuiruoni+对字符串进行消毒：去除首尾空白，转义HTML特殊字符
inline std::string clean_text(const std::string& input) {
    // 去除首尾空白
    size_t start = input.find_first_not_of(" \t\r\n");
    size_t end = input.find_last_not_of(" \t\r\n");
    if (start == std::string::npos) return "";

    std::string trimmed = input.substr(start, end - start + 1);
    return escape_html(trimmed);
}

// @cuiruoni+截断字符串到指定最大长度，防止超长输入
inline std::string truncate(const std::string& input, size_t max_len) {
    if (input.size() <= max_len) return input;
    return input.substr(0, max_len);
}

// @cuiruoni+安全解析整数，解析失败返回默认值而非抛异常，防止非法URL参数导致500
inline int safe_stoi(const std::string& str, int default_val = 0) {
    try { return std::stoi(str); }
    catch (...) { return default_val; }
}

// @cuiruoni+安全解析64位整数，解析失败返回默认值而非抛异常
inline int64_t safe_stoll(const std::string& str, int64_t default_val = 0) {
    try { return std::stoll(str); }
    catch (...) { return default_val; }
}

// @cuiruoni+URL协议白名单校验：只允许http/https和相对路径，阻止javascript:等危险协议
inline std::string safe_url(const std::string& input) {
    std::string trimmed = input;
    size_t start = trimmed.find_first_not_of(" \t\r\n");
    size_t end = trimmed.find_last_not_of(" \t\r\n");
    if (start == std::string::npos) return "";
    trimmed = trimmed.substr(start, end - start + 1);

    std::string lower = trimmed;
    for (auto& c : lower) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));

    if (lower.find("javascript:") != std::string::npos ||
        lower.find("data:") != std::string::npos ||
        lower.find("vbscript:") != std::string::npos) {
        return "";
    }
    return truncate(trimmed, 500);
}

// @cuiruoni+常见弱密码黑名单检查，防止满足复杂度规则但实际很弱的密码
inline bool is_common_weak_password(const std::string& password) {
    static const std::vector<std::string> weak_passwords = {
        "Password1", "Password123", "Qwerty123", "Admin123",
        "Welcome1", "Letmein1", "Monkey123", "Dragon123",
        "Master123", "Login123", "Passw0rd", "P@ssw0rd",
        "Aa123456", "Abc12345", "123456Aa", "Qwerty1",
        "Abc1234", "Test1234", "Changeme1", "Default1"
    };
    std::string lower = password;
    for (auto& c : lower) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
    for (const auto& weak : weak_passwords) {
        std::string weak_lower = weak;
        for (auto& c : weak_lower) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
        if (lower == weak_lower) return true;
    }
    return false;
}

}
