#pragma once

#include "server/router.h"

// @cuiruoni+注册管理员API路由，所有路由需要admin权限
void register_admin_routes(Router& router);
