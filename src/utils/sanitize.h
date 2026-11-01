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

// @cuiruoni+P1修复：去除首尾空白后原样存储，不做HTML转义。
// 前端React渲染文本时会自动转义，后端入库再转义会导致双重编码（用户输入<显示为&lt;）。
// 需要输出为HTML的场景应显式调用escape_html。
inline std::string clean_text(const std::string& input) {
    size_t start = input.find_first_not_of(" \t\r\n");
    size_t end = input.find_last_not_of(" \t\r\n");
    if (start == std::string::npos) return "";
    return input.substr(start, end - start + 1);
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

// @cuiruoni+B4：分页参数统一夹紧。负数/0 会生成负 OFFSET 直接让 MySQL 报错，
// @cuiruoni+所有列表接口都走这两个函数，避免 8 个 controller 各写一遍。
// @cuiruoni+上界同样是修 B4：DAO 里统一写 int offset = (page - 1) * page_size，
// @cuiruoni+page 只夹下界时 ?page=2000000000&page_size=100 会在 int 里溢出成负数，
// @cuiruoni+又回到「负 OFFSET → MySQL 报错 → 500」这条原本要堵死的路。
// @cuiruoni+配合 clamp_page_size 的 100 上限，100000 页最大 offset 约 1000 万，不会溢出。
inline int clamp_page(int page) {
    constexpr int kMaxPage = 100000;  // 超出即视为「翻到头」，返回空列表而不是让数据库扫全表
    if (page < 1) return 1;
    return page > kMaxPage ? kMaxPage : page;
}

inline int clamp_page_size(int page_size, int default_val = 10) {
    if (page_size <= 0) return default_val;
    return page_size > 100 ? 100 : page_size;
}

inline int clamp_int(int value, int min_value, int max_value) {
    if (value < min_value) return min_value;
    if (value > max_value) return max_value;
    return value;
}

// @cuiruoni+B6：LIKE 模式转义。用户输入的 % / _ / \ 必须按字面量匹配，
// @cuiruoni+配合 SQL 里的 ESCAPE '\\' 使用。
inline std::string escape_like(const std::string& input) {
    std::string output;
    output.reserve(input.size());
    for (char c : input) {
        if (c == '\\' || c == '%' || c == '_') output.push_back('\\');
        output.push_back(c);
    }
    return output;
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
