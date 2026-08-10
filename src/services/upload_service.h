#pragma once

#include <string>

// @cuiruoni+分片上传会话管理：支持断点续传
// @cuiruoni+流程：init 创建会话 → 按 Content-Range 顺序追加分片（幂等，支持断点重传）
// @cuiruoni+→ query 查询已收字节 → complete 校验合并后提交风格生成任务
// @cuiruoni+会话绑定 user_id：append/query/complete 均校验属主，防越权
namespace upload_service {

struct InitResult {
    bool ok = false;
    int http_status = 200;    // @cuiruoni+失败时状态码（400 参数/413 过大/503 会话上限）
    std::string upload_id;
    std::string error;
    size_t chunk_received = 0;
};

struct AppendResult {
    bool ok = false;          // @cuiruoni+false 表示应返回错误状态
    int http_status = 200;    // @cuiruoni+ok=false 时建议的 HTTP 状态码（409/400/404/403）
    size_t received = 0;      // @cuiruoni+当前已收字节数
    std::string error;
};

struct QueryResult {
    bool ok = false;
    int http_status = 200;
    std::string upload_id;
    std::string mime;
    size_t file_size = 0;
    size_t received = 0;
    std::string error;
};

struct CompleteResult {
    bool ok = false;
    int http_status = 200;    // @cuiruoni+失败时的状态码（400 校验失败 / 503 队列满 / 500 其他）
    std::string task_id;
    std::string error;
};

// @cuiruoni+创建上传会话（绑定属主 user_id），file_size 超过上限或会话数达上限返回失败
InitResult init(int64_t owner_id, size_t file_size, const std::string& mime);

// @cuiruoni+追加分片。start/end 为闭区间（含 end）。顺序模型：
// @cuiruoni+start == received → 追加；start < received 且 end <= received → 幂等跳过（200）；
// @cuiruoni+start > received → 409 提示前端重新对齐断点；属主不匹配 → 403
AppendResult append(int64_t owner_id, const std::string& upload_id, size_t start, size_t end,
                    const char* data, size_t len);

// @cuiruoni+查询会话状态（断点恢复），属主不匹配 → 403
QueryResult query(int64_t owner_id, const std::string& upload_id);

// @cuiruoni+合并分片 → 校验 → 提交风格生成任务。
// @cuiruoni+仅成功提交（或校验失败清理无效数据）时删除会话；
// @cuiruoni+队列满（QUEUE_FULL）保留会话与分片，前端稍后可重试 complete
CompleteResult complete(int64_t owner_id, const std::string& upload_id, const std::string& style);

// @cuiruoni+惰性清理过期会话与磁盘残留（超过 30 分钟），由 init/query/complete 内部触发
void prune_expired();

}
