#pragma once

#include <string>

// @cuiruoni+视频分片上传会话管理（断点续传）
// @cuiruoni+流程：init 创建会话 → PUT 按 Content-Range 顺序追加分片（幂等，支持断点重传）
// @cuiruoni+→ GET query 查询已收字节（前端断点对齐）→ complete 校验合并后落库进投稿表
// @cuiruoni+会话绑定 user_id：append/query/complete/abort 均校验属主，防越权
// @cuiruoni+会话数据在内存（进程重启丢失，客户端收到 404 后重新 init 即可），分片落盘
namespace video_upload_service {

struct InitResult {
    bool ok = false;
    int http_status = 200;    // @cuiruoni+失败时状态码（400 参数 / 413 过大 / 503 会话上限）
    std::string upload_id;
    std::string error;
    size_t received = 0;
};

struct AppendResult {
    bool ok = false;          // @cuiruoni+false 表示应返回错误状态
    int http_status = 200;    // @cuiruoni+ok=false 时的 HTTP 状态码（409 断点超前 / 400 / 404 / 403）
    size_t received = 0;      // @cuiruoni+当前已收字节数（幂等跳过/正常追加都回传，前端据此对齐）
    std::string error;
};

struct QueryResult {
    bool ok = false;
    int http_status = 200;
    size_t received = 0;
    std::string error;
};

struct CompleteResult {
    bool ok = false;
    int http_status = 200;    // @cuiruoni+失败时状态码（400 校验失败 / 404 会话不存在 / 409 未收满）
    int64_t submission_id = 0;
    std::string url;
    std::string error;
};

// @cuiruoni+创建上传会话（绑定属主），file_size 超过上限或会话数达上限返回失败
InitResult init(int64_t owner_id, size_t file_size, const std::string& original_name);

// @cuiruoni+追加分片。start/end 为闭区间（含 end）。顺序模型：
// @cuiruoni+start == received → 追加；start+1 <= received（已收过）→ 幂等跳过（200）；
// @cuiruoni+start > received → 409 提示前端重新对齐断点；属主不匹配 → 403
AppendResult append(int64_t owner_id, const std::string& upload_id, size_t start, size_t end,
                    const char* data, size_t len);

// @cuiruoni+查询会话状态（断点恢复），属主不匹配 → 403
QueryResult query(int64_t owner_id, const std::string& upload_id);

// @cuiruoni+校验收满 + magic bytes（mp4/webm）→ 改名落盘 → 写入投稿表（status=pending）。
// @cuiruoni+仅成功或校验失败时清理会话；失败保留会话与分片供重试
CompleteResult complete(int64_t owner_id, const std::string& upload_id);

// @cuiruoni+放弃上传：删除会话与临时分片
void abort(int64_t owner_id, const std::string& upload_id);

// @cuiruoni+惰性清理过期会话与磁盘残留（超过 30 分钟），由 init/query/append/complete 内部触发
void prune_expired();

}
