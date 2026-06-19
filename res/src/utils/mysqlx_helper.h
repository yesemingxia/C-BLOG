#pragma once

#include <boost/json.hpp>
#include <mysqlx/xdevapi.h>
#include <string>

namespace json = boost::json;

// @cuiruoni+MySQL X DevAPI值类型转换辅助，将mysqlx::Value转为boost::json兼容类型
// @cuiruoni+解决MySQL X DevAPI与JSON序列化之间的类型桥接问题
namespace mysqlx_helper {

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
        return json::value(static_cast<std::string>(v));
    default:
        return json::value(static_cast<std::string>(v)); // @cuiruoni+其他类型兜底转为字符串
    }
}

// @cuiruoni+将mysqlx::Value转为std::string，NULL返回空字符串
inline std::string to_string(const mysqlx::Value& v) {
    if (v.isNull()) return "";
    return static_cast<std::string>(v);
}

// @cuiruoni+检查Row中指定列是否为NULL，避免直接访问null值导致异常
inline bool is_null(const mysqlx::Row& row, mysqlx::col_count_t col) {
    return row[col].isNull();
}

}
