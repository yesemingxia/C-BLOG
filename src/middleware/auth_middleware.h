#pragma once

#include <boost/beast/http.hpp>
#include <string>
#include <functional>

#include "server/router.h"

namespace http = boost::beast::http;

MiddlewareFunc create_auth_middleware();

// @cuiruoni+基于路径白名单的认证中间件，公开接口放行，受保护接口检查token
MiddlewareFunc create_path_protected_auth_middleware();
