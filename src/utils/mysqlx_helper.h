#pragma once

#include <boost/json.hpp>
#include <mysqlx/xdevapi.h>
#include <string>

namespace json = boost::json;

namespace mysqlx_helper {

inline json::value to_json(const mysqlx::Value& v) {
    if (v.is_null()) return json::value{};
    switch (v.get_type()) {
    case mysqlx::Value::VNULL:
        return json::value{};
    case mysqlx::Value::INT64:
        return json::value(v.get_sint());
    case mysqlx::Value::UINT64:
        return json::value(static_cast<int64_t>(v.get_uint()));
    case mysqlx::Value::FLOAT:
        return json::value(static_cast<double>(v.get_float()));
    case mysqlx::Value::DOUBLE:
        return json::value(v.get_double());
    case mysqlx::Value::BOOL:
        return json::value(v.get_bool());
    case mysqlx::Value::STRING:
        return json::value(v.get_string());
    default:
        return json::value(std::string(v.get_string()));
    }
}

inline std::string to_string(const mysqlx::Value& v) {
    if (v.is_null()) return "";
    return v.get_string();
}

inline bool is_null(const mysqlx::Row& row, mysqlx::col_count_t col) {
    return row[col].is_null();
}

}
