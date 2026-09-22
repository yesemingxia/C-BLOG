#include "controllers/upload_controller.h"

#include "services/auth_service.h"
#include "utils/logger.h"
#include "utils/response.h"
#include "utils/password.h"

#include <boost/json.hpp>

#include <filesystem>
#include <fstream>
#include <random>
#include <chrono>

namespace json = boost::json;
namespace http = boost::beast::http;

namespace {

// @cuiruoni+图片存储目录（相对工作目录；uploads/ 已在 .gitignore 中）
constexpr const char* kImageDir = "uploads/images";
// @cuiruoni+base64 最大长度：约 10MB（对应原图 ~7.5MB），博客插图足够
constexpr size_t kMaxImageBase64Len = 10 * 1024 * 1024;

// @cuiruoni+允许的图片 MIME 白名单（与 style_controller 一致）
bool is_valid_mime(const std::string& mime) {
    static const std::vector<std::string> allowed = {
        "image/png", "image/jpeg", "image/webp", "image/gif", "image/bmp"
    };
    for (const auto& m : allowed) {
        if (mime == m) return true;
    }
    return false;
}

// @cuiruoni+校验 base64 字符集，防止注入非法字符
bool is_valid_base64(const std::string& s) {
    for (char c : s) {
        bool ok = (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') ||
                  (c >= '0' && c <= '9') || c == '+' || c == '/' || c == '=';
        if (!ok) return false;
    }
    return !s.empty();
}

// @cuiruoni+MIME → 扩展名（白名单已校验，一一对应）
std::string mime_to_ext(const std::string& mime) {
    if (mime == "image/png") return "png";
    if (mime == "image/jpeg") return "jpg";
    if (mime == "image/webp") return "webp";
    if (mime == "image/gif") return "gif";
    if (mime == "image/bmp") return "bmp";
    return "bin";
}

// @cuiruoni+生成不重复文件名：毫秒时间戳 + 64bit 随机 hex，避免并发覆盖与枚举
std::string make_filename(const std::string& ext) {
    static std::mt19937_64 rng{std::random_device{}()};
    auto now = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::system_clock::now().time_since_epoch()).count();
    char buf[32];
    std::snprintf(buf, sizeof(buf), "%016llx",
                  static_cast<unsigned long long>(rng()));
    return std::to_string(now) + "_" + buf + "." + ext;
}

// @cuiruoni+POST /api/upload/image → 上传一张图片，返回访问 URL
http::response<http::string_body> handle_upload_image(
    const http::request<http::string_body>& req, const RouteParams&) {
    // @cuiruoni+中间件已要求登录，这里再提取 user_id 供日志追踪
    int64_t user_id = 0;
    std::string username, role;
    if (!auth_service::extract_user_from_token(req, user_id, username, role)) {
        http::response<http::string_body> res{http::status::unauthorized, req.version()};
        res.body() = response::error(401, "请先登录后上传图片");
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

        std::string image_base64, image_mime;
        if (!get_str("image_base64", image_base64) || image_base64.empty()) {
            http::response<http::string_body> res{http::status::bad_request, req.version()};
            res.body() = response::error(400, "缺少 image_base64 参数");
            res.prepare_payload();
            return res;
        }
        if (image_base64.size() > kMaxImageBase64Len) {
            http::response<http::string_body> res{http::status::payload_too_large, req.version()};
            res.body() = response::error(413, "图片过大，请压缩后重试（上限约 7.5MB）");
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

        std::string content = password::base64_decode(image_base64);
        if (content.empty()) {
            http::response<http::string_body> res{http::status::bad_request, req.version()};
            res.body() = response::error(400, "图片数据解码失败");
            res.prepare_payload();
            return res;
        }

        std::filesystem::create_directories(kImageDir);
        std::string name = make_filename(mime_to_ext(image_mime));
        std::string path = std::string(kImageDir) + "/" + name;

        std::ofstream out(path, std::ios::binary | std::ios::trunc);
        if (!out) {
            spdlog::error("[upload] cannot open file for writing: {}", path);
            http::response<http::string_body> res{http::status::internal_server_error, req.version()};
            res.body() = response::error(500, "保存图片失败");
            res.prepare_payload();
            return res;
        }
        out.write(content.data(), static_cast<std::streamsize>(content.size()));
        out.close();
        if (!out) {
            spdlog::error("[upload] write failed: {}", path);
            http::response<http::string_body> res{http::status::internal_server_error, req.version()};
            res.body() = response::error(500, "保存图片失败");
            res.prepare_payload();
            return res;
        }

        spdlog::info("[upload] user {} saved image {} ({} bytes)", user_id, name, content.size());

        json::object data;
        data["url"] = std::string("/api/upload/file/") + name;
        http::response<http::string_body> res{http::status::ok, req.version()};
        res.body() = response::success(json::value(std::move(data)));
        res.prepare_payload();
        return res;
    } catch (const std::exception& e) {
        spdlog::warn("[upload] image parse error: {}", e.what());
        http::response<http::string_body> res{http::status::bad_request, req.version()};
        res.body() = response::error(400, "请求体 JSON 解析失败");
        res.prepare_payload();
        return res;
    }
}

// @cuiruoni+GET /api/upload/file/:name → 读取已上传图片（公开，读者未登录也能看）
http::response<http::string_body> handle_get_file(
    const http::request<http::string_body>& req, const RouteParams& params) {
    auto it = params.path.find("name");
    if (it == params.path.end()) {
        http::response<http::string_body> res{http::status::bad_request, req.version()};
        res.body() = response::error(400, "缺少文件名");
        res.prepare_payload();
        return res;
    }

    // @cuiruoni+文件名白名单校验，防路径穿越（与 style_controller 同一套规则）
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

    std::string path = std::string(kImageDir) + "/" + name;
    std::ifstream in(path, std::ios::binary);
    if (!in) {
        http::response<http::string_body> res{http::status::not_found, req.version()};
        res.body() = response::error(404, "文件不存在");
        res.prepare_payload();
        return res;
    }
    std::string content((std::istreambuf_iterator<char>(in)), std::istreambuf_iterator<char>());

    // @cuiruoni+按 magic bytes 探测图片格式，避免固定 content-type 与实际内容不符
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

void register_upload_routes(Router& router) {
    router.add_route("POST", "/api/upload/image", handle_upload_image);
    router.add_route("GET", "/api/upload/file/:name", handle_get_file);
    spdlog::info("Upload routes registered");
}
