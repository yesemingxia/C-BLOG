#include "controllers/style_controller.h"

#include "services/auth_service.h"
#include "services/style_service.h"
#include "services/upload_service.h"
#include "utils/logger.h"
#include "utils/response.h"

#include <boost/json.hpp>

#include <filesystem>
#include <fstream>

namespace json = boost::json;
namespace http = boost::beast::http;

namespace {

// @cuiruoni+base64 图片最大长度：约 15MB（对应原图 ~11MB）
constexpr size_t kMaxImageBase64Len = 15 * 1024 * 1024;
// @cuiruoni+submit 返回的队列已满标记（见 style_service::submit）
constexpr const char* kQueueFullMark = "__QUEUE_FULL__";

// @cuiruoni+允许的图片 MIME 白名单
bool is_valid_mime(const std::string& mime) {
    static const std::vector<std::string> allowed = {
        "image/png", "image/jpeg", "image/webp", "image/gif", "image/bmp"
    };
    for (const auto& m : allowed) {
        if (mime == m) return true;
    }
    return false;
}

// @cuiruoni+校验 base64 字符集（仅 [A-Za-z0-9+/=]），防止无效输入透传上游浪费配额
bool is_valid_base64(const std::string& s) {
    for (char c : s) {
        bool ok = (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') ||
                  (c >= '0' && c <= '9') || c == '+' || c == '/' || c == '=';
        if (!ok) return false;
    }
    return !s.empty();
}

// @cuiruoni+GET /api/styles → 可用风格列表
http::response<http::string_body> handle_list_styles(
    const http::request<http::string_body>& req, const RouteParams&) {
    json::array arr;
    for (const auto& s : style_service::list_styles()) {
        json::object o;
        o["id"] = s.id;
        o["name"] = s.name;
        o["description"] = s.description;
        o["ratio"] = s.ratio;
        arr.push_back(json::value(std::move(o)));
    }

    http::response<http::string_body> res{http::status::ok, req.version()};
    res.body() = response::success(json::value(std::move(arr)));
    res.prepare_payload();
    return res;
}

// @cuiruoni+POST /api/styles/transfer → 提交任务，立即返回 task_id
// @cuiruoni+需登录：AI 生成为付费操作，防止匿名滥用消耗 API 配额
http::response<http::string_body> handle_transfer(
    const http::request<http::string_body>& req, const RouteParams&) {
    int64_t user_id = 0;
    std::string username, role;
    if (!auth_service::extract_user_from_token(req, user_id, username, role)) {
        http::response<http::string_body> res{http::status::unauthorized, req.version()};
        res.body() = response::error(401, "请先登录后使用图片生成");
        res.prepare_payload();
        return res;
    }

    try {
        json::value v = json::parse(req.body());
        if (!v.is_object()) {
            http::response<http::string_body> res{http::status::bad_request, req.version()};
            res.body() = response::error(400, "请求体必须是 JSON 对象");
            res.prepare_payload();
            return res;
        }
        const auto& obj = v.as_object();

        auto get_str = [&obj](const char* key, std::string& out) -> bool {
            auto it = obj.find(key);
            if (it == obj.end() || !it->value().is_string()) return false;
            out = std::string(it->value().as_string());
            return true;
        };

        std::string style, image_base64, image_mime;
        if (!get_str("style", style) || style.empty()) {
            http::response<http::string_body> res{http::status::bad_request, req.version()};
            res.body() = response::error(400, "缺少 style 参数");
            res.prepare_payload();
            return res;
        }
        if (!get_str("image_base64", image_base64) || image_base64.empty()) {
            http::response<http::string_body> res{http::status::bad_request, req.version()};
            res.body() = response::error(400, "缺少 image_base64 参数");
            res.prepare_payload();
            return res;
        }
        if (image_base64.size() > kMaxImageBase64Len) {
            http::response<http::string_body> res{http::status::payload_too_large, req.version()};
            res.body() = response::error(413, "图片过大，请压缩后重试（上限约 11MB）");
            res.prepare_payload();
            return res;
        }
        if (!get_str("image_mime", image_mime) || image_mime.empty()) {
            image_mime = "image/png"; // @cuiruoni+默认按 PNG 处理
        }
        if (!is_valid_mime(image_mime)) {
            http::response<http::string_body> res{http::status::bad_request, req.version()};
            res.body() = response::error(400, "不支持的图片格式");
            res.prepare_payload();
            return res;
        }
        if (!is_valid_base64(image_base64)) {
            http::response<http::string_body> res{http::status::bad_request, req.version()};
            res.body() = response::error(400, "图片数据格式非法");
            res.prepare_payload();
            return res;
        }

        std::string task_id = style_service::submit(style, image_mime, image_base64);
        if (task_id == kQueueFullMark) {
            http::response<http::string_body> res{http::status::too_many_requests, req.version()};
            res.body() = response::error(429, "系统繁忙，请稍后重试");
            res.prepare_payload();
            return res;
        }
        if (task_id.empty()) {
            http::response<http::string_body> res{http::status::bad_request, req.version()};
            res.body() = response::error(400, "不支持的风格或图片为空");
            res.prepare_payload();
            return res;
        }

        json::object data;
        data["task_id"] = task_id;
        http::response<http::string_body> res{http::status::ok, req.version()};
        res.body() = response::success(json::value(std::move(data)));
        res.prepare_payload();
        return res;
    } catch (const std::exception& e) {
        spdlog::warn("[style] transfer parse error: {}", e.what());
        http::response<http::string_body> res{http::status::bad_request, req.version()};
        res.body() = response::error(400, "请求体 JSON 解析失败");
        res.prepare_payload();
        return res;
    }
}

// @cuiruoni+GET /api/styles/tasks/:id → 任务状态
http::response<http::string_body> handle_get_task(
    const http::request<http::string_body>& req, const RouteParams& params) {
    auto it = params.path.find("id");
    if (it == params.path.end()) {
        http::response<http::string_body> res{http::status::bad_request, req.version()};
        res.body() = response::error(400, "缺少 task id");
        res.prepare_payload();
        return res;
    }

    style_service::StyleTask task;
    if (!style_service::get_task(it->second, task)) {
        http::response<http::string_body> res{http::status::not_found, req.version()};
        res.body() = response::error(404, "任务不存在");
        res.prepare_payload();
        return res;
    }

    json::object data;
    data["id"] = task.id;
    data["style"] = task.style;
    data["status"] = task.status;
    data["error"] = task.error;
    data["result_url"] = task.result_url;
    data["created_at"] = task.created_at;

    http::response<http::string_body> res{http::status::ok, req.version()};
    res.body() = response::success(json::value(std::move(data)));
    res.prepare_payload();
    return res;
}

// @cuiruoni+GET /api/styles/file/:name → 返回生成图
http::response<http::string_body> handle_get_file(
    const http::request<http::string_body>& req, const RouteParams& params) {
    auto it = params.path.find("name");
    if (it == params.path.end()) {
        http::response<http::string_body> res{http::status::bad_request, req.version()};
        res.body() = response::error(400, "缺少文件名");
        res.prepare_payload();
        return res;
    }

    // @cuiruoni+文件名白名单校验，防路径穿越
    const std::string& name = it->second;
    if (name.size() > 128 || name.find("..") != std::string::npos ||
        name.find('/') != std::string::npos || name.find('\\') != std::string::npos) {
        http::response<http::string_body> res{http::status::bad_request, req.version()};
        res.body() = response::error(400, "非法文件名");
        res.prepare_payload();
        return res;
    }
    for (char c : name) {
        if (!std::isalnum(static_cast<unsigned char>(c)) && c != '.' && c != '-' && c != '_') {
            http::response<http::string_body> res{http::status::bad_request, req.version()};
            res.body() = response::error(400, "非法文件名");
            res.prepare_payload();
            return res;
        }
    }

    std::string path = std::string(style_service::kUploadDir) + "/" + name;
    std::ifstream in(path, std::ios::binary);
    if (!in) {
        http::response<http::string_body> res{http::status::not_found, req.version()};
        res.body() = response::error(404, "文件不存在");
        res.prepare_payload();
        return res;
    }
    std::string content((std::istreambuf_iterator<char>(in)), std::istreambuf_iterator<char>());

    // @cuiruoni+按 magic bytes 探测图片格式，避免固定 image/png 与实际内容不符
    std::string content_type = "application/octet-stream";
    if (content.size() >= 8) {
        const unsigned char* b = reinterpret_cast<const unsigned char*>(content.data());
        if (b[0] == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G') {
            content_type = "image/png";
        } else if (b[0] == 0xFF && b[1] == 0xD8 && b[2] == 0xFF) {
            content_type = "image/jpeg";
        } else if (b[0] == 'R' && b[1] == 'I' && b[2] == 'F' && b[3] == 'F' &&
                   content.size() >= 12 &&
                   content[8] == 'W' && content[9] == 'E' && content[10] == 'B' && content[11] == 'P') {
            content_type = "image/webp";
        } else if (b[0] == 'G' && b[1] == 'I' && b[2] == 'F') {
            content_type = "image/gif";
        } else if (b[0] == 'B' && b[1] == 'M') {
            content_type = "image/bmp";
        }
    }

    http::response<http::string_body> res{http::status::ok, req.version()};
    res.set(http::field::content_type, content_type);
    res.set(http::field::cache_control, "public, max-age=86400");
    res.body() = std::move(content);
    res.prepare_payload();
    return res;
}

} // namespace

// @cuiruoni+POST /api/styles/upload/init → 创建分片上传会话（断点续传）
http::response<http::string_body> handle_upload_init(
    const http::request<http::string_body>& req, const RouteParams&) {
    // @cuiruoni+会话绑定当前登录用户（中间件已要求登录，此处提取 user_id 做属主）
    int64_t user_id = 0;
    std::string username, role;
    if (!auth_service::extract_user_from_token(req, user_id, username, role)) {
        http::response<http::string_body> res{http::status::unauthorized, req.version()};
        res.body() = response::error(401, "请先登录");
        res.prepare_payload();
        return res;
    }

    try {
        json::value v;
        try {
            v = json::parse(req.body());
        } catch (const std::exception&) {
            http::response<http::string_body> res{http::status::bad_request, req.version()};
            res.body() = response::error(400, "请求体必须是合法 JSON");
            res.prepare_payload();
            return res;
        }
        const auto& obj = v.as_object();

        auto get_str = [&obj](const char* key, std::string& out) -> bool {
            auto it = obj.find(key);
            if (it == obj.end() || !it->value().is_string()) return false;
            out = std::string(it->value().as_string());
            return true;
        };

        size_t file_size = 0;
        auto fs = obj.find("file_size");
        if (fs != obj.end() && fs->value().is_int64()) {
            file_size = static_cast<size_t>(fs->value().as_int64());
        }
        std::string file_mime;
        if (file_size == 0 || !get_str("file_mime", file_mime)) {
            http::response<http::string_body> res{http::status::bad_request, req.version()};
            res.body() = response::error(400, "缺少 file_size / file_mime 参数");
            res.prepare_payload();
            return res;
        }

        auto r = upload_service::init(user_id, file_size, file_mime);
        if (!r.ok) {
            http::response<http::string_body> res{
                static_cast<http::status>(r.http_status), req.version()};
            res.body() = response::error(r.http_status, r.error);
            res.prepare_payload();
            return res;
        }

        json::object data;
        data["upload_id"] = r.upload_id;
        data["received"] = r.chunk_received;
        http::response<http::string_body> res{http::status::ok, req.version()};
        res.body() = response::success(json::value(std::move(data)));
        res.prepare_payload();
        return res;
    } catch (const std::exception& e) {
        spdlog::warn("[upload] init error: {}", e.what());
        http::response<http::string_body> res{http::status::bad_request, req.version()};
        res.body() = response::error(400, "请求解析失败");
        res.prepare_payload();
        return res;
    }
}

// @cuiruoni+PUT /api/styles/upload/:id → 追加一个分片（二进制 body + Content-Range 头）
// @cuiruoni+Content-Range 格式：bytes start-end/total（end 为闭区间）
http::response<http::string_body> handle_upload_append(
    const http::request<http::string_body>& req, const RouteParams& params) {
    auto it = params.path.find("id");
    if (it == params.path.end()) {
        http::response<http::string_body> res{http::status::bad_request, req.version()};
        res.body() = response::error(400, "缺少 upload id");
        res.prepare_payload();
        return res;
    }

    int64_t user_id = 0;
    std::string username, role;
    if (!auth_service::extract_user_from_token(req, user_id, username, role)) {
        http::response<http::string_body> res{http::status::unauthorized, req.version()};
        res.body() = response::error(401, "请先登录");
        res.prepare_payload();
        return res;
    }

    auto cr = req.find("Content-Range");
    if (cr == req.end()) {
        http::response<http::string_body> res{http::status::bad_request, req.version()};
        res.body() = response::error(400, "缺少 Content-Range 头");
        res.prepare_payload();
        return res;
    }

    // @cuiruoni+完整解析 bytes start-end/total（校验 total 存在且无多余后缀）
    size_t start = 0, end = 0, total = 0;
    char extra = '\0';
    std::string range(cr->value());
    int parsed = std::sscanf(range.c_str(), "bytes %zu-%zu/%zu%c", &start, &end, &total, &extra);
    if (range.rfind("bytes ", 0) != 0 || parsed < 3 || (parsed == 4 && extra != '\0')) {
        http::response<http::string_body> res{http::status::bad_request, req.version()};
        res.body() = response::error(400, "Content-Range 格式非法");
        res.prepare_payload();
        return res;
    }

    auto r = upload_service::append(user_id, it->second, start, end,
                                    req.body().data(), req.body().size());
    if (!r.ok) {
        http::response<http::string_body> res{
            static_cast<http::status>(r.http_status), req.version()};
        res.body() = response::error(r.http_status, r.error);
        res.prepare_payload();
        return res;
    }

    json::object data;
    data["received"] = r.received;
    http::response<http::string_body> res{http::status::ok, req.version()};
    res.body() = response::success(json::value(std::move(data)));
    res.prepare_payload();
    return res;
}

// @cuiruoni+GET /api/styles/upload/:id → 查询上传进度（断点恢复），需登录且属主匹配
http::response<http::string_body> handle_upload_query(
    const http::request<http::string_body>& req, const RouteParams& params) {
    auto it = params.path.find("id");
    if (it == params.path.end()) {
        http::response<http::string_body> res{http::status::bad_request, req.version()};
        res.body() = response::error(400, "缺少 upload id");
        res.prepare_payload();
        return res;
    }

    int64_t user_id = 0;
    std::string username, role;
    if (!auth_service::extract_user_from_token(req, user_id, username, role)) {
        http::response<http::string_body> res{http::status::unauthorized, req.version()};
        res.body() = response::error(401, "请先登录");
        res.prepare_payload();
        return res;
    }

    auto r = upload_service::query(user_id, it->second);
    if (!r.ok) {
        http::response<http::string_body> res{
            static_cast<http::status>(r.http_status), req.version()};
        res.body() = response::error(r.http_status, r.error);
        res.prepare_payload();
        return res;
    }

    json::object data;
    data["upload_id"] = r.upload_id;
    data["file_size"] = r.file_size;
    data["received"] = r.received;
    data["file_mime"] = r.mime;
    http::response<http::string_body> res{http::status::ok, req.version()};
    res.body() = response::success(json::value(std::move(data)));
    res.prepare_payload();
    return res;
}

// @cuiruoni+POST /api/styles/upload/:id/complete → 合并分片、校验并提交生成任务
http::response<http::string_body> handle_upload_complete(
    const http::request<http::string_body>& req, const RouteParams& params) {
    auto it = params.path.find("id");
    if (it == params.path.end()) {
        http::response<http::string_body> res{http::status::bad_request, req.version()};
        res.body() = response::error(400, "缺少 upload id");
        res.prepare_payload();
        return res;
    }

    int64_t user_id = 0;
    std::string username, role;
    if (!auth_service::extract_user_from_token(req, user_id, username, role)) {
        http::response<http::string_body> res{http::status::unauthorized, req.version()};
        res.body() = response::error(401, "请先登录");
        res.prepare_payload();
        return res;
    }

    // @cuiruoni+解析风格参数（默认实景拼贴）
    std::string style = "gathered";
    try {
        json::value v = json::parse(req.body());
        if (v.is_object()) {
            auto sit = v.as_object().find("style");
            if (sit != v.as_object().end() && sit->value().is_string()) {
                style = std::string(sit->value().as_string());
            }
        }
    } catch (...) {
        // @cuiruoni+body 非 JSON 时按默认风格处理
    }

    auto r = upload_service::complete(user_id, it->second, style);
    if (!r.ok) {
        http::response<http::string_body> res{
            static_cast<http::status>(r.http_status), req.version()};
        res.body() = response::error(r.http_status, r.error);
        res.prepare_payload();
        return res;
    }

    json::object data;
    data["task_id"] = r.task_id;
    http::response<http::string_body> res{http::status::ok, req.version()};
    res.body() = response::success(json::value(std::move(data)));
    res.prepare_payload();
    return res;
}

void register_style_routes(Router& router) {
    router.add_route("GET", "/api/styles", handle_list_styles);
    router.add_route("POST", "/api/styles/transfer", handle_transfer);
    router.add_route("GET", "/api/styles/tasks/:id", handle_get_task);
    router.add_route("GET", "/api/styles/file/:name", handle_get_file);
    router.add_route("POST", "/api/styles/upload/init", handle_upload_init);
    router.add_route("PUT", "/api/styles/upload/:id", handle_upload_append);
    router.add_route("GET", "/api/styles/upload/:id", handle_upload_query);
    router.add_route("POST", "/api/styles/upload/:id/complete", handle_upload_complete);
    spdlog::info("Style routes registered");
}
