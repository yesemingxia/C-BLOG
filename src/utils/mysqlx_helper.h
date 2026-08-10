#pragma once

#include <boost/json.hpp>
#include <mysqlx/xdevapi.h>
#include <string>

namespace json = boost::json;

// @cuiruoni+MySQL X DevAPI值类型转换辅助，将mysqlx::Value转为boost::json兼容类型
// @cuiruoni+解决MySQL X DevAPI与JSON序列化之间的类型桥接问题
namespace mysqlx_helper {

// @cuiruoni+部分环境下 mysql-connector-cpp 会把 MySQL 返回的 UTF-8 字节
// 按 latin1 解释后再以 UTF-8 存到 std::string，导致非 ASCII 字符出现乱码。
// 此函数把这类“UTF-8 编码的 latin1 码点”还原为原始 UTF-8 字节。
inline std::string recover_utf8(const std::string& input) {
    std::string output;
    output.reserve(input.size());
    for (size_t i = 0; i < input.size(); ) {
        unsigned char c = static_cast<unsigned char>(input[i]);
        if (c < 0x80) {
            output.push_back(static_cast<char>(c));
            ++i;
        } else if ((c & 0xE0) == 0xC0 && i + 1 < input.size()) {
            unsigned char c2 = static_cast<unsigned char>(input[i + 1]);
            unsigned int cp = ((c & 0x1F) << 6) | (c2 & 0x3F);
            if (cp <= 0xFF) {
                output.push_back(static_cast<char>(cp));
                i += 2;
            } else {
                output.push_back(static_cast<char>(c));
                output.push_back(static_cast<char>(c2));
                i += 2;
            }
        } else {
            output.push_back(static_cast<char>(c));
            ++i;
        }
    }
    return output;
}

// @cuiruoni+将mysqlx::Value转为json::value，处理NULL/INT64/UINT64/FLOAT/DOUBLE/BOOL/STRING等类型
// @cuiruoni+UINT64先转uint64_t再转int64_t，可能溢出但实际业务中ID不会超过int64范围
inline json::value to_json(const mysqlx::Value& v) {
    if (v.isNull()) return json::value{};
    switch (v.getType()) {
    case mysqlx::Value::VNULL:
        return json::value{};
    case mysqlx::Value::INT64:
        return json::value(static_cast<int64_t>(v));
    case mysqlx::Value::UINT64:
        return json::value(static_cast<int64_t>(static_cast<uint64_t>(v)));
    case mysqlx::Value::FLOAT:
        return json::value(static_cast<double>(static_cast<float>(v)));
    case mysqlx::Value::DOUBLE:
        return json::value(static_cast<double>(v));
    case mysqlx::Value::BOOL:
        return json::value(static_cast<bool>(v));
    case mysqlx::Value::STRING:
        return json::value(recover_utf8(static_cast<std::string>(v)));
    default:
        return json::value(recover_utf8(static_cast<std::string>(v))); // @cuiruoni+其他类型兜底转为字符串
    }
}

// @cuiruoni+将mysqlx::Value转为std::string，NULL返回空字符串
inline std::string to_string(const mysqlx::Value& v) {
    if (v.isNull()) return "";
    return recover_utf8(static_cast<std::string>(v));
}

// @cuiruoni+检查Row中指定列是否为NULL，避免直接访问null值导致异常
inline bool is_null(const mysqlx::Row& row, mysqlx::col_count_t col) {
    return row[col].isNull();
}

}
