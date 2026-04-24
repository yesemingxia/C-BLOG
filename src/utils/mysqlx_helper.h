#pragma once

#include <boost/json.hpp>
#include <mysqlx/xdevapi.h>
#include <string>

namespace json = boost::json;

namespace mysqlx_helper {

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
        return json::value(static_cast<std::string>(v));
    }
}

inline std::string to_string(const mysqlx::Value& v) {
    if (v.isNull()) return "";
    return static_cast<std::string>(v);
}

inline bool is_null(const mysqlx::Row& row, mysqlx::col_count_t col) {
    return row[col].isNull();
}

}
