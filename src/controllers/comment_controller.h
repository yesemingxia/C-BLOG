#pragma once

#include <boost/beast/http.hpp>
#include "server/router.h"

void register_comment_routes(Router& router);
