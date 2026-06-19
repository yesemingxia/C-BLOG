#pragma once

#include <boost/beast/http.hpp>
#include "server/router.h"

// @cuiruoni+标签控制器：提供标签列表和按标签查询文章的路由注册
void register_tag_routes(Router& router);
