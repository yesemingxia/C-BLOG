#pragma once

#include <boost/beast/http.hpp>
#include <string>

namespace http = boost::beast::http;

namespace cors_middleware {

void cors_handle_request(const http::request<http::string_body>& req,
                         http::response<http::string_body>& res);

}
