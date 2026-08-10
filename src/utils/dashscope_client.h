#pragma once

#include <string>

// @cuiruoni+DashScope（阿里云百炼）图像生成 API 封装
// @cuiruoni+图生图：提交参考图（base64）+ 文本指令 → 异步任务 → 轮询 → 结果图 URL
namespace dashscope {

struct SubmitResult {
    bool ok = false;
    std::string task_id;    // @cuiruoni+异步任务 ID
    std::string error;      // @cuiruoni+失败原因（ok=false 时）
};

struct QueryResult {
    std::string status;     // @cuiruoni+PENDING / RUNNING / SUCCEEDED / FAILED / 空（解析失败）
    std::string image_url;  // @cuiruoni+SUCCEEDED 后有效
    std::string error;      // @cuiruoni+FAILED 时有效
};

// @cuiruoni+提交图生图任务（异步接口 X-DashScope-Async: enable）
SubmitResult submit_image_edit(const std::string& api_key, const std::string& model,
                               const std::string& image_mime, const std::string& image_base64,
                               const std::string& prompt);

// @cuiruoni+查询任务状态
QueryResult query_task(const std::string& api_key, const std::string& task_id);

}
