#include "controllers/video_controller.h"

#include "dao/video_dao.h"
#include "services/auth_service.h"
#include "services/video_upload_service.h"
#include "utils/logger.h"
#include "utils/response.h"
#include "utils/sanitize.h"

#include <boost/json.hpp>

#include <filesystem>
#include <fstream>

namespace json = boost::json;
namespace http = boost::beast::http;

namespace {

// @cuiruoni+视频存储目录（相对工作目录；uploads/ 已在 .gitignore 中）
constexpr const char* kVideoDir = "uploads/videos";

// @cuiruoni+文件名白名单校验，防路径穿越（与图片上传同一套规则）
bool is_safe_name(const std::string& name) {
    if (name.size() > 128 || name.find("..") != std::string::npos ||
        name.find('/') != std::string::npos || name.find('\\') != std::string::npos) {
        return false;
    }
    for (char c : name) {
        if (!std::isalnum(static_cast<unsigned char>(c)) && c != '.' && c != '-' && c != '_') {
            return false;
        }
    }
    return true;
}

http::response<http::string_body> make_error(const http::request<http::string_body>& req,
                                             http::status code, const char* msg) {
    http::response<http::string_body> res{code, req.version()};
    res.body() = response::error(static_cast<int>(code), msg);
    res.prepare_payload();
    return res;
}

// @cuiruoni+登录校验，失败时直接返回 401 响应
bool require_user(const http::request<http::string_body>& req, int64_t& user_id) {
    std::string username, role;
    if (!auth_service::extract_user_from_token(req, user_id, username, role)) {
        return false;
    }
    return true;
}

// @cuiruoni+POST /api/videos/upload/init → 创建分片上传会话（断点续传第一步）
http::response<http::string_body> handle_upload_init(
    const http::request<http::string_body>& req, const RouteParams&) {
    int64_t user_id = 0;
    if (!require_user(req, user_id)) {
        return make_error(req, http::status::unauthorized, "请先登录后上传视频");
    }

    size_t file_size = 0;
    std::string original_name = "video";
    try {
        json::value v = json::parse(req.body());
        if (v.is_object()) {
            const auto& obj = v.as_object();
            auto fit = obj.find("file_size");
            if (fit != obj.end() && fit->value().is_int64()) {
                file_size = static_cast<size_t>(fit->value().as_int64());
            }
            auto nit = obj.find("filename");
            if (nit != obj.end() && nit->value().is_string()) {
                original_name = std::string(nit->value().as_string());
            }
        }
    } catch (...) {
        return make_error(req, http::status::bad_request, "请求体必须是 JSON 对象");
    }
    if (file_size == 0) {
        return make_error(req, http::status::bad_request, "缺少 file_size 参数");
    }

    auto r = video_upload_service::init(user_id, file_size, original_name);
    if (!r.ok) {
        return make_error(req, static_cast<http::status>(r.http_status), r.error.c_str());
    }

    json::object data;
    data["upload_id"] = r.upload_id;
    data["received"] = r.received;
    http::response<http::string_body> res{http::status::ok, req.version()};
    res.body() = response::success(json::value(std::move(data)));
    res.prepare_payload();
    return res;
}

// @cuiruoni+PUT /api/videos/upload/:id → 追加一个二进制分片（Content-Range: bytes start-end/total）
http::response<http::string_body> handle_upload_append(
    const http::request<http::string_body>& req, const RouteParams& params) {
    int64_t user_id = 0;
    if (!require_user(req, user_id)) {
        return make_error(req, http::status::unauthorized, "请先登录后上传视频");
    }

    auto it = params.path.find("id");
    if (it == params.path.end() || it->second.empty()) {
        return make_error(req, http::status::bad_request, "缺少 upload id");
    }

    auto cr = req.find("Content-Range");
    if (cr == req.end()) {
        return make_error(req, http::status::bad_request, "缺少 Content-Range 头");
    }

    // @cuiruoni+完整解析 bytes start-end/total（end 闭区间；校验 total 存在且无多余后缀）
    size_t start = 0, end = 0, total = 0;
    char extra = '\0';
    std::string range(cr->value());
    int parsed = std::sscanf(range.c_str(), "bytes %zu-%zu/%zu%c", &start, &end, &total, &extra);
    if (range.rfind("bytes ", 0) != 0 || parsed < 3 || (parsed == 4 && extra != '\0')) {
        return make_error(req, http::status::bad_request, "Content-Range 格式非法");
    }
    if (end < start) {
        return make_error(req, http::status::bad_request, "Content-Range 区间非法");
    }
    size_t len = end - start + 1;
    if (len != req.body().size()) {
        return make_error(req, http::status::bad_request, "分片长度与 Content-Range 不一致");
    }

    auto r = video_upload_service::append(user_id, it->second, start, end,
                                          req.body().data(), req.body().size());
    if (!r.ok) {
        return make_error(req, static_cast<http::status>(r.http_status), r.error.c_str());
    }

    json::object data;
    data["received"] = r.received;
    http::response<http::string_body> res{http::status::ok, req.version()};
    res.body() = response::success(json::value(std::move(data)));
    res.prepare_payload();
    return res;
}

// @cuiruoni+GET /api/videos/upload/:id → 查询已收字节（断点对齐）
http::response<http::string_body> handle_upload_query(
    const http::request<http::string_body>& req, const RouteParams& params) {
    int64_t user_id = 0;
    if (!require_user(req, user_id)) {
        return make_error(req, http::status::unauthorized, "请先登录后上传视频");
    }

    auto it = params.path.find("id");
    if (it == params.path.end() || it->second.empty()) {
        return make_error(req, http::status::bad_request, "缺少 upload id");
    }

    auto r = video_upload_service::query(user_id, it->second);
    if (!r.ok) {
        return make_error(req, static_cast<http::status>(r.http_status), r.error.c_str());
    }

    json::object data;
    data["received"] = r.received;
    http::response<http::string_body> res{http::status::ok, req.version()};
    res.body() = response::success(json::value(std::move(data)));
    res.prepare_payload();
    return res;
}

// @cuiruoni+POST /api/videos/upload/:id/complete → 校验收满 + magic bytes → 落库 pending
http::response<http::string_body> handle_upload_complete(
    const http::request<http::string_body>& req, const RouteParams& params) {
    int64_t user_id = 0;
    if (!require_user(req, user_id)) {
        return make_error(req, http::status::unauthorized, "请先登录后上传视频");
    }

    auto it = params.path.find("id");
    if (it == params.path.end() || it->second.empty()) {
        return make_error(req, http::status::bad_request, "缺少 upload id");
    }

    auto r = video_upload_service::complete(user_id, it->second);
    if (!r.ok) {
        return make_error(req, static_cast<http::status>(r.http_status), r.error.c_str());
    }

    spdlog::info("[video] user {} completed resumable upload id {}", user_id, r.submission_id);
    json::object data;
    data["id"] = r.submission_id;
    data["url"] = r.url;
    data["status"] = "pending";
    http::response<http::string_body> res{http::status::ok, req.version()};
    res.body() = response::success(json::value(std::move(data)));
    res.prepare_payload();
    return res;
}

// @cuiruoni+DELETE /api/videos/upload/:id → 放弃上传（删会话与临时分片）
http::response<http::string_body> handle_upload_abort(
    const http::request<http::string_body>& req, const RouteParams& params) {
    int64_t user_id = 0;
    if (!require_user(req, user_id)) {
        return make_error(req, http::status::unauthorized, "请先登录后上传视频");
    }

    auto it = params.path.find("id");
    if (it == params.path.end() || it->second.empty()) {
        return make_error(req, http::status::bad_request, "缺少 upload id");
    }

    video_upload_service::abort(user_id, it->second);
    http::response<http::string_body> res{http::status::ok, req.version()};
    res.body() = response::success(std::string("Upload aborted"));
    res.prepare_payload();
    return res;
}

// @cuiruoni+GET /api/videos/active → 当前启用的那支背景视频（公开；没有则返回 null，
//                                        前端回退默认视频）。页面上**永远只有一个**背景视频。
http::response<http::string_body> handle_active(
    const http::request<http::string_body>& req, const RouteParams&) {
    json::object data;
    json::object active = video_dao::get_active();
    if (!active.empty()) data["video"] = json::value(std::move(active));
    else data["video"] = json::value();
    http::response<http::string_body> res{http::status::ok, req.version()};
    res.body() = response::success(json::value(std::move(data)));
    res.prepare_payload();
    return res;
}

// @cuiruoni+GET /api/videos/mine → 当前用户的投稿与审核状态
http::response<http::string_body> handle_mine(
    const http::request<http::string_body>& req, const RouteParams&) {
    int64_t user_id = 0;
    std::string username, role;
    if (!auth_service::extract_user_from_token(req, user_id, username, role)) {
        return make_error(req, http::status::unauthorized, "请先登录");
    }

    json::object data;
    data["videos"] = video_dao::list_by_uploader(user_id);
    http::response<http::string_body> res{http::status::ok, req.version()};
    res.body() = response::success(json::value(std::move(data)));
    res.prepare_payload();
    return res;
}

// @cuiruoni+PUT /api/videos/:id/status → 管理员审核
http::response<http::string_body> handle_set_status(
    const http::request<http::string_body>& req, const RouteParams& params) {
    int64_t admin_id = 0;
    std::string username, role;
    if (!auth_service::extract_admin_from_token(req, admin_id, username, role)) {
        return make_error(req, http::status::forbidden, "Admin access required");
    }

    auto it = params.path.find("id");
    if (it == params.path.end()) {
        return make_error(req, http::status::bad_request, "Missing id");
    }
    int64_t id = sanitize::safe_stoll(it->second);

    std::string status;
    try {
        json::value v = json::parse(req.body());
        if (v.is_object()) {
            auto sit = v.as_object().find("status");
            if (sit != v.as_object().end() && sit->value().is_string()) {
                status = std::string(sit->value().as_string());
            }
        }
    } catch (...) {
        return make_error(req, http::status::bad_request, "请求体必须是 JSON 对象");
    }
    if (status != "approved" && status != "rejected" && status != "pending") {
        return make_error(req, http::status::bad_request, "非法状态");
    }

    video_dao::VideoRow row;
    if (!video_dao::get(id, row)) {
        return make_error(req, http::status::not_found, "投稿不存在");
    }
    if (!video_dao::set_status(id, status)) {
        return make_error(req, http::status::internal_server_error, "更新失败");
    }
    // @cuiruoni+驳回/撤回审核时自动停用，保证「启用中的必须是 approved」
    if (status != "approved" && row.is_active) {
        video_dao::deactivate(id);
    }

    spdlog::info("[video] admin {} set submission {} -> {}", admin_id, id, status);
    json::object data;
    data["id"] = id;
    data["status"] = status;
    http::response<http::string_body> res{http::status::ok, req.version()};
    res.body() = response::success(json::value(std::move(data)));
    res.prepare_payload();
    return res;
}

// @cuiruoni+PUT /api/videos/:id/active → 管理员启用/停用当前背景（全局唯一）
//   body {active:true}  → 自动通过并启用（同时清掉其他启用标记）
//   body {active:false} → 仅停用
http::response<http::string_body> handle_set_active(
    const http::request<http::string_body>& req, const RouteParams& params) {
    int64_t admin_id = 0;
    std::string username, role;
    if (!auth_service::extract_admin_from_token(req, admin_id, username, role)) {
        return make_error(req, http::status::forbidden, "Admin access required");
    }

    auto it = params.path.find("id");
    if (it == params.path.end()) {
        return make_error(req, http::status::bad_request, "Missing id");
    }
    int64_t id = sanitize::safe_stoll(it->second);

    bool active = true;
    try {
        json::value v = json::parse(req.body());
        if (v.is_object()) {
            auto ait = v.as_object().find("active");
            if (ait != v.as_object().end() && ait->value().is_bool()) {
                active = ait->value().as_bool();
            }
        }
    } catch (...) {
        return make_error(req, http::status::bad_request, "请求体必须是 JSON 对象");
    }

    video_dao::VideoRow row;
    if (!video_dao::get(id, row)) {
        return make_error(req, http::status::not_found, "投稿不存在");
    }

    if (active) {
        // @cuiruoni+启用前置条件：必须是 approved；还是 pending 就顺手通过
        if (row.status != "approved") {
            video_dao::set_status(id, "approved");
        }
        if (!video_dao::set_active(id)) {
            return make_error(req, http::status::internal_server_error, "启用失败");
        }
        spdlog::info("[video] admin {} activated submission {}", admin_id, id);
    } else {
        if (!video_dao::deactivate(id)) {
            return make_error(req, http::status::internal_server_error, "停用失败");
        }
        spdlog::info("[video] admin {} deactivated submission {}", admin_id, id);
    }

    json::object data;
    data["id"] = id;
    data["is_active"] = active;
    http::response<http::string_body> res{http::status::ok, req.version()};
    res.body() = response::success(json::value(std::move(data)));
    res.prepare_payload();
    return res;
}

// @cuiruoni+GET /api/admin/videos?status=&page= → 管理员分页查看投稿
http::response<http::string_body> handle_admin_list(
    const http::request<http::string_body>& req, const RouteParams& params) {
    int64_t admin_id = 0;
    std::string username, role;
    if (!auth_service::extract_admin_from_token(req, admin_id, username, role)) {
        return make_error(req, http::status::forbidden, "Admin access required");
    }

    int page = 1, page_size = 10;
    auto it = params.query.find("page");
    if (it != params.query.end() && !it->second.empty()) page = sanitize::safe_stoi(it->second);
    it = params.query.find("page_size");
    if (it != params.query.end() && !it->second.empty()) page_size = sanitize::safe_stoi(it->second);
    if (page_size > 100) page_size = 100;

    std::string status = "all";
    it = params.query.find("status");
    if (it != params.query.end()) status = it->second;

    int total = 0;
    json::array arr = video_dao::list_by_status(status, page, page_size, total);

    json::object data;
    data["videos"] = std::move(arr);
    data["total"] = total;
    data["page"] = page;
    data["page_size"] = page_size;
    http::response<http::string_body> res{http::status::ok, req.version()};
    res.body() = response::success(json::value(std::move(data)));
    res.prepare_payload();
    return res;
}

// @cuiruoni+DELETE /api/videos/:id → 删除（本人或管理员），同时删文件
http::response<http::string_body> handle_delete(
    const http::request<http::string_body>& req, const RouteParams& params) {
    int64_t user_id = 0;
    std::string username, role;
    if (!auth_service::extract_user_from_token(req, user_id, username, role)) {
        return make_error(req, http::status::unauthorized, "请先登录");
    }

    auto it = params.path.find("id");
    if (it == params.path.end()) {
        return make_error(req, http::status::bad_request, "Missing id");
    }
    int64_t id = sanitize::safe_stoll(it->second);

    video_dao::VideoRow row;
    if (!video_dao::get(id, row)) {
        return make_error(req, http::status::not_found, "投稿不存在");
    }
    const bool is_admin = (role == "admin");
    if (row.uploader_id != user_id && !is_admin) {
        return make_error(req, http::status::forbidden, "只能删除自己的投稿");
    }

    if (!video_dao::delete_by_id(id)) {
        return make_error(req, http::status::internal_server_error, "删除失败");
    }
    std::string path = std::string(kVideoDir) + "/" + row.filename;
    std::error_code ec;
    std::filesystem::remove(path, ec);
    if (ec) spdlog::warn("[video] file remove failed: {} ({})", path, ec.message());

    spdlog::info("[video] submission {} deleted by user {}", id, user_id);
    http::response<http::string_body> res{http::status::ok, req.version()};
    res.body() = response::success(std::string("Video deleted"));
    res.prepare_payload();
    return res;
}

// @cuiruoni+GET /api/videos/file/:name → 公开读取视频文件
http::response<http::string_body> handle_get_file(
    const http::request<http::string_body>& req, const RouteParams& params) {
    auto it = params.path.find("name");
    if (it == params.path.end()) {
        return make_error(req, http::status::bad_request, "缺少文件名");
    }

    const std::string& name = it->second;
    if (!is_safe_name(name)) {
        return make_error(req, http::status::bad_request, "非法文件名");
    }

    std::string path = std::string(kVideoDir) + "/" + name;
    std::ifstream in(path, std::ios::binary);
    if (!in) {
        return make_error(req, http::status::not_found, "文件不存在");
    }
    std::string content((std::istreambuf_iterator<char>(in)), std::istreambuf_iterator<char>());

    std::string content_type = "application/octet-stream";
    if (name.size() > 4 && name.compare(name.size() - 4, 4, ".mp4") == 0) {
        content_type = "video/mp4";
    } else if (name.size() > 5 && name.compare(name.size() - 5, 5, ".webm") == 0) {
        content_type = "video/webm";
    }

    http::response<http::string_body> res{http::status::ok, req.version()};
    res.set(http::field::content_type, content_type);
    res.set(http::field::cache_control, "public, max-age=86400");
    res.body() = std::move(content);
    res.prepare_payload();
    return res;
}

} // namespace

void register_video_routes(Router& router) {
    // @cuiruoni+分片上传（断点续传）：init → PUT 分片 → complete；GET 查断点；DELETE 放弃
    router.add_route("POST", "/api/videos/upload/init", handle_upload_init);
    router.add_route("PUT", "/api/videos/upload/:id", handle_upload_append);
    router.add_route("GET", "/api/videos/upload/:id", handle_upload_query);
    router.add_route("POST", "/api/videos/upload/:id/complete", handle_upload_complete);
    router.add_route("DELETE", "/api/videos/upload/:id", handle_upload_abort);
    router.add_route("GET", "/api/videos/active", handle_active);
    router.add_route("GET", "/api/videos/mine", handle_mine);
    router.add_route("PUT", "/api/videos/:id/status", handle_set_status);
    router.add_route("PUT", "/api/videos/:id/active", handle_set_active);
    router.add_route("GET", "/api/admin/videos", handle_admin_list);
    router.add_route("DELETE", "/api/videos/:id", handle_delete);
    router.add_route("GET", "/api/videos/file/:name", handle_get_file);
    spdlog::info("Video routes registered");
}
