#pragma once

#include <boost/beast/http.hpp>
#include "server/router.h"

void register_auth_routes(Router& router);
