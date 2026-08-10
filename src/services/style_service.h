#pragma once

#include <string>
#include <vector>

// @cuiruoni+风格转换服务：多风格注册表 + 任务队列 + 后台调用外部生成 API
// @cuiruoni+对外提供：风格列表 / 提交任务（立即返回 task_id）/ 查询任务
namespace style_service {

// @cuiruoni+生成图存储目录（相对工作目录，前后端共用）
inline constexpr const char* kUploadDir = "uploads/style";

// @cuiruoni+风格定义（可扩展：新增风格只需在 cpp 中注册风格项 + prompt 模板）
struct StyleInfo {
    std::string id;          // @cuiruoni+风格标识，如 gathered / distillation
    std::string name;        // @cuiruoni+中文名
    std::string description; // @cuiruoni+中文描述
    std::string ratio;       // @cuiruoni+画幅，如 3:5 / 5:3
};

struct StyleTask {
    std::string id;
    std::string style;
    std::string status;       // @cuiruoni+pending | processing | done | failed
    std::string error;        // @cuiruoni+失败原因
    std::string result_url;   // @cuiruoni+生成图访问路径（/api/styles/file/xxx.png）
    std::string created_at;   // @cuiruoni+提交时间
};

// @cuiruoni+可用风格列表（顺序即展示顺序）
std::vector<StyleInfo> list_styles();

// @cuiruoni+提交风格转换任务，成功返回非空 task_id，失败返回空串
std::string submit(const std::string& style, const std::string& image_mime,
                   const std::string& image_base64);

// @cuiruoni+查询任务，不存在返回 false
bool get_task(const std::string& task_id, StyleTask& out);

// @cuiruoni+初始化（创建存储目录），程序启动时调用一次
void init();

// @cuiruoni+优雅关闭：等待所有后台任务结束后返回（最多等待 30 秒），程序退出时调用
void shutdown();

}
