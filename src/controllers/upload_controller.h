#pragma once

#include "server/router.h"

// @cuiruoni+通用图片上传：编辑器插图 / 文章封面等场景共用
// @cuiruoni+POST /api/upload/image  → JSON {image_base64, image_mime}，需登录，落盘 uploads/images/
// @cuiruoni+GET  /api/upload/file/:name → 公开读取已上传图片（读者未登录也要能看图）
void register_upload_routes(Router& router);
