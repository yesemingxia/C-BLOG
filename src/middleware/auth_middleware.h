#pragma once

#include <boost/beast/http.hpp>
#include <string>
#include <functional>

#include "server/router.h"

namespace http = boost::beast::http;

MiddlewareFunc create_auth_middleware();
