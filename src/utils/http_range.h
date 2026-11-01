#pragma once

#include <cstdint>
#include <cstdlib>
#include <string>

// @cuiruoni+B10：单段 Range 解析（纯逻辑，便于单测）。
// @cuiruoni+返回三种状态：
// @cuiruoni+  present=false                 → 没带 Range / 格式非法 / 多段（按 HTTP 语义忽略，返回 200 全量）
// @cuiruoni+  present=true, satisfiable=false → 合法但越界 → 416 + Content-Range: bytes */size
// @cuiruoni+  present=true, satisfiable=true  → 206 部分内容
namespace http_range {

struct ByteRange {
    bool present = false;
    bool satisfiable = false;
    std::uint64_t start = 0;
    std::uint64_t end = 0;   // 闭区间
};

inline bool parse_uint(const std::string& text, std::uint64_t& out) {
    if (text.empty()) return false;
    std::uint64_t value = 0;
    for (char c : text) {
        if (c < '0' || c > '9') return false;
        std::uint64_t digit = static_cast<std::uint64_t>(c - '0');
        if (value > (UINT64_MAX - digit) / 10) return false;
        value = value * 10 + digit;
    }
    out = value;
    return true;
}

inline ByteRange parse(const std::string& header, std::uint64_t file_size) {
    ByteRange range;
    const std::string prefix = "bytes=";
    if (header.size() <= prefix.size() ||
        header.compare(0, prefix.size(), prefix) != 0) {
        return range;
    }

    std::string spec = header.substr(prefix.size());
    // 多段 Range 暂不支持：按 HTTP 规范可以忽略 Range，返回完整 200
    if (spec.find(',') != std::string::npos) return range;

    auto dash = spec.find('-');
    if (dash == std::string::npos) return range;

    std::string left = spec.substr(0, dash);
    std::string right = spec.substr(dash + 1);
    if (left.empty() && right.empty()) return range;

    range.present = true;
    if (file_size == 0) {
        range.satisfiable = false;
        return range;
    }

    if (left.empty()) {
        // suffix-byte-range-spec: bytes=-N
        std::uint64_t suffix = 0;
        if (!parse_uint(right, suffix) || suffix == 0) {
            range.present = false;
            return range;
        }
        if (suffix > file_size) suffix = file_size;
        range.start = file_size - suffix;
        range.end = file_size - 1;
        range.satisfiable = true;
        return range;
    }

    std::uint64_t start = 0;
    if (!parse_uint(left, start)) {
        range.present = false;
        return range;
    }
    if (start >= file_size) {
        range.satisfiable = false;
        return range;
    }

    if (right.empty()) {
        range.start = start;
        range.end = file_size - 1;
        range.satisfiable = true;
        return range;
    }

    std::uint64_t end = 0;
    if (!parse_uint(right, end)) {
        range.present = false;
        return range;
    }
    if (end < start) {
        range.satisfiable = false;
        return range;
    }
    if (end >= file_size) end = file_size - 1;
    range.start = start;
    range.end = end;
    range.satisfiable = true;
    return range;
}

} // namespace http_range
