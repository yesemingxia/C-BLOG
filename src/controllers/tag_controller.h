#pragma once

#include <boost/beast/http.hpp>
#include "server/router.h"

void register_tag_routes(Router& router);
