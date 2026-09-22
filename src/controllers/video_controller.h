#pragma once

#include "server/router.h"

// @cuiruoni+视频投稿（用户投稿 + 管理员审核，单一启用）：
//   POST   /api/videos/upload/init       登录用户创建分片上传会话（断点续传）
//   PUT    /api/videos/upload/:id        顺序追加分片（二进制 body + Content-Range，单片 ≤2MB）
//   GET    /api/videos/upload/:id        查询已收字节（断点对齐）
//   POST   /api/videos/upload/:id/complete  校验收满 + magic bytes → 落库 pending
//   DELETE /api/videos/upload/:id        放弃上传（删会话与临时分片）
//   GET    /api/videos/active            公开：当前启用的那支背景视频（全局唯一，没有则 null）
//   GET    /api/videos/mine              登录用户查看自己的投稿与审核状态
//   PUT    /api/videos/:id/status        管理员审核（approved / rejected）
//   PUT    /api/videos/:id/active        管理员启用/停用（全局唯一）
//   DELETE /api/videos/:id               删除（本人或管理员），同时删文件
//   GET    /api/videos/file/:name        公开读取视频文件
void register_video_routes(Router& router);
