#pragma once

#include <cctype>
#include <string>
#include <unordered_set>
#include <vector>

// @cuiruoni+B12：从评论正文提取 @username。
// @cuiruoni+规则：@ 必须是开头或位于空白/常见标点之后（排除邮箱），
// @cuiruoni+用户名持续到空白或标点；结果去重并限制数量，避免一条评论刷出大量通知。
namespace mentions {

inline bool is_delimiter(unsigned char c) {
    if (std::isspace(c)) return true;
    switch (c) {
        case ',' : case '.' : case ';' : case ':' : case '!' : case '?':
        case '(' : case ')' : case '[' : case ']' : case '{' : case '}':
        case '<' : case '>' : case '"' : case '\'' : case '/' : case '\\':
            return true;
        default:
            return false;
    }
}

inline bool is_cjk_delimiter(const std::string& s, size_t i) {
    // 常见中文标点（UTF-8 三字节）：，。；：！？、（）【】《》「」『』
    static const std::vector<std::string> puncts = {
        "，", "。", "；", "：", "！", "？", "、", "（", "）",
        "【", "】", "《", "》", "「", "」", "『", "』", "…",
    };
    for (const auto& p : puncts) {
        if (s.compare(i, p.size(), p) == 0) return true;
    }
    return false;
}

inline std::vector<std::string> extract(const std::string& text, size_t max_mentions = 5) {
    std::vector<std::string> result;
    std::unordered_set<std::string> seen;

    for (size_t i = 0; i < text.size(); ++i) {
        if (text[i] != '@') continue;
        if (i > 0) {
            unsigned char prev = static_cast<unsigned char>(text[i - 1]);
            // 邮箱中间的 @ 不算提及
            if (std::isalnum(prev) || prev == '.' || prev == '_' || prev == '-' || prev == '+') {
                continue;
            }
        }

        size_t start = i + 1;
        size_t j = start;
        while (j < text.size()) {
            unsigned char c = static_cast<unsigned char>(text[j]);
            if (std::isspace(c) || is_delimiter(c)) break;
            if (static_cast<unsigned char>(text[j]) >= 0x80 && is_cjk_delimiter(text, j)) break;
            j++;
        }
        if (j <= start) continue;

        std::string name = text.substr(start, j - start);
        // 去掉尾部常见的英文标点（用户名本身不含这些字符的概率更高）
        while (!name.empty()) {
            char last = name.back();
            if (last == '.' || last == ',' || last == ';' || last == ':' || last == '!' || last == '?') {
                name.pop_back();
            } else {
                break;
            }
        }
        if (name.empty() || name.size() > 50) continue;
        if (seen.insert(name).second) {
            result.push_back(name);
            if (result.size() >= max_mentions) break;
        }
    }
    return result;
}

} // namespace mentions
