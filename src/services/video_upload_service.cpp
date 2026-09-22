#include "services/video_upload_service.h"
#include "dao/video_dao.h"
#include "utils/logger.h"
#include "utils/sanitize.h"

#include <algorithm>
#include <chrono>
#include <cstdio>
#include <filesystem>
#include <fstream>
#include <map>
#include <mutex>
#include <random>

namespace fs = std::filesystem;

namespace video_upload_service {

namespace {

// @cuiruoni+视频存储目录与分片临时目录（uploads/ 已在 .gitignore 中）
constexpr const char* kVideoDir = "uploads/videos";
constexpr const char* kTmpDir = "uploads/videos/tmp";
// @cuiruoni+与投稿一致的大小上限；分片 body 限额由 session.cpp 单独放宽到 2MB
constexpr size_t kMaxVideoBytes = 50 * 1024 * 1024;
constexpr size_t kMaxChunkBytes = 2 * 1024 * 1024;
// @cuiruoni+会话过期时间与全局会话数上限
constexpr int kSessionTtlSeconds = 30 * 60;
constexpr size_t kMaxSessions = 20;

struct UploadSession {
    int64_t owner_id = 0;
    size_t file_size = 0;
    size_t received = 0;
    std::string original_name;
    std::string temp_path;
    std::chrono::steady_clock::time_point last_active;
};

std::mutex g_mutex;
std::map<std::string, UploadSession> g_sessions;

std::string random_id() {
    static std::mt19937_64 rng{std::random_device{}()};
    char buf[32];
    std::snprintf(buf, sizeof(buf), "%016llx", static_cast<unsigned long long>(rng()));
    auto now = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::system_clock::now().time_since_epoch()).count();
    return std::to_string(now) + "_" + buf;
}

// @cuiruoni+惰性清理：删掉超时未活跃的会话与其 .part 文件
void prune_locked() {
    auto now = std::chrono::steady_clock::now();
    for (auto it = g_sessions.begin(); it != g_sessions.end();) {
        if (std::chrono::duration_cast<std::chrono::seconds>(now - it->second.last_active).count() >
            kSessionTtlSeconds) {
            std::error_code ec;
            fs::remove(it->second.temp_path, ec);
            it = g_sessions.erase(it);
        } else {
            ++it;
        }
    }
}

// @cuiruoni+magic bytes：mp4（ftyp box 在偏移 4）/ webm（EBML 头）。返回对应扩展名，空串=非法
std::string detect_ext(const std::string& head) {
    if (head.size() >= 12 && head[4] == 'f' && head[5] == 't' && head[6] == 'y' && head[7] == 'p') {
        return "mp4";
    }
    if (head.size() >= 4 &&
        static_cast<unsigned char>(head[0]) == 0x1A && static_cast<unsigned char>(head[1]) == 0x45 &&
        static_cast<unsigned char>(head[2]) == 0xDF && static_cast<unsigned char>(head[3]) == 0xA3) {
        return "webm";
    }
    return "";
}

std::string make_filename(const std::string& ext) {
    static std::mt19937_64 rng{std::random_device{}()};
    char buf[32];
    std::snprintf(buf, sizeof(buf), "%016llx", static_cast<unsigned long long>(rng()));
    auto now = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::system_clock::now().time_since_epoch()).count();
    return std::to_string(now) + "_" + buf + "." + ext;
}

} // namespace

InitResult init(int64_t owner_id, size_t file_size, const std::string& original_name) {
    InitResult r;
    std::lock_guard<std::mutex> lock(g_mutex);
    prune_locked();

    if (file_size == 0 || file_size > kMaxVideoBytes) {
        r.http_status = 413;
        r.error = "视频大小必须在 1B ~ 50MB 之间";
        return r;
    }
    if (g_sessions.size() >= kMaxSessions) {
        r.http_status = 503;
        r.error = "上传会话数已达上限，请稍后重试";
        return r;
    }

    fs::create_directories(kTmpDir);
    UploadSession s;
    s.owner_id = owner_id;
    s.file_size = file_size;
    s.original_name = sanitize::truncate(sanitize::clean_text(original_name), 200);
    if (s.original_name.empty()) s.original_name = "video";
    s.received = 0;
    s.last_active = std::chrono::steady_clock::now();
    s.temp_path = std::string(kTmpDir) + "/" + random_id() + ".part";

    std::ofstream out(s.temp_path, std::ios::binary | std::ios::trunc);
    if (!out) {
        r.http_status = 500;
        r.error = "创建分片文件失败";
        return r;
    }

    r.upload_id = random_id();
    g_sessions[r.upload_id] = std::move(s);
    r.ok = true;
    r.received = 0;
    return r;
}

AppendResult append(int64_t owner_id, const std::string& upload_id, size_t start, size_t end,
                    const char* data, size_t len) {
    AppendResult r;
    std::lock_guard<std::mutex> lock(g_mutex);
    prune_locked();

    auto it = g_sessions.find(upload_id);
    if (it == g_sessions.end()) {
        r.http_status = 404;
        r.error = "上传会话不存在或已过期，请重新上传";
        return r;
    }
    UploadSession& s = it->second;
    if (s.owner_id != owner_id) {
        r.http_status = 403;
        r.error = "无权操作该上传会话";
        return r;
    }
    if (len == 0 || len > kMaxChunkBytes || end < start || end >= s.file_size) {
        r.http_status = 400;
        r.error = "分片范围非法";
        return r;
    }

    // @cuiruoni+顺序模型：已收过 → 幂等跳过；超前 → 409 让前端重新对齐。
    // @cuiruoni+能走到真正追加的分支时恒有 start == received，直接顺序写在文件末尾。
    if (start > s.received) {
        r.http_status = 409;
        r.received = s.received;
        r.error = "分片超前，请从已收字节继续";
        return r;
    }
    if (end < s.received) {
        s.last_active = std::chrono::steady_clock::now();
        r.ok = true;
        r.received = s.received;
        return r;
    }

    // @cuiruoni+分片可能部分重叠（start < received <= end）：只写未收到的尾巴
    const size_t skip = s.received - start;
    std::ofstream out(s.temp_path, std::ios::binary | std::ios::app);
    if (!out) {
        r.http_status = 500;
        r.error = "写入分片失败";
        return r;
    }
    out.write(data + skip, static_cast<std::streamsize>(len - skip));
    out.close();
    if (!out) {
        r.http_status = 500;
        r.error = "写入分片失败";
        return r;
    }

    s.received += (len - skip);
    s.last_active = std::chrono::steady_clock::now();
    r.ok = true;
    r.received = s.received;
    return r;
}

QueryResult query(int64_t owner_id, const std::string& upload_id) {
    QueryResult r;
    std::lock_guard<std::mutex> lock(g_mutex);
    prune_locked();

    auto it = g_sessions.find(upload_id);
    if (it == g_sessions.end()) {
        r.http_status = 404;
        r.error = "上传会话不存在或已过期";
        return r;
    }
    if (it->second.owner_id != owner_id) {
        r.http_status = 403;
        r.error = "无权操作该上传会话";
        return r;
    }
    it->second.last_active = std::chrono::steady_clock::now();
    r.ok = true;
    r.received = it->second.received;
    return r;
}

CompleteResult complete(int64_t owner_id, const std::string& upload_id) {
    CompleteResult r;
    {
        std::lock_guard<std::mutex> lock(g_mutex);
        prune_locked();

        auto it = g_sessions.find(upload_id);
        if (it == g_sessions.end()) {
            r.http_status = 404;
            r.error = "上传会话不存在或已过期";
            return r;
        }
        UploadSession& s = it->second;
        if (s.owner_id != owner_id) {
            r.http_status = 403;
            r.error = "无权操作该上传会话";
            return r;
        }
        if (s.received != s.file_size) {
            r.http_status = 409;
            r.error = "分片尚未收满（" + std::to_string(s.received) + "/" +
                      std::to_string(s.file_size) + "）";
            return r;
        }

        // @cuiruoni+读文件头校验 magic bytes
        std::ifstream in(s.temp_path, std::ios::binary);
        if (!in) {
            r.http_status = 500;
            r.error = "读取分片文件失败";
            return r;
        }
        char head[16] = {0};
        in.read(head, sizeof(head));
        in.close();
        std::string ext = detect_ext(std::string(head, sizeof(head)));
        if (ext.empty()) {
            // @cuiruoni+校验失败：清理会话与分片，前端提示换文件
            fs::remove(s.temp_path);
            g_sessions.erase(it);
            r.http_status = 400;
            r.error = "仅支持 MP4 / WebM 格式的视频";
            return r;
        }

        // @cuiruoni+改名进正式目录
        std::string filename = make_filename(ext);
        std::string final_path = std::string(kVideoDir) + "/" + filename;
        std::error_code ec;
        fs::create_directories(kVideoDir);
        fs::rename(s.temp_path, final_path, ec);
        if (ec) {
            r.http_status = 500;
            r.error = "保存视频失败";
            return r;
        }

        int64_t new_id = 0;
        if (!video_dao::insert(owner_id, filename, s.original_name, new_id)) {
            fs::remove(final_path, ec);
            r.http_status = 500;
            r.error = "保存视频失败";
            return r;
        }

        g_sessions.erase(it);
        r.ok = true;
        r.submission_id = new_id;
        r.url = std::string("/api/videos/file/") + filename;
        return r;
    }

    // @cuiruoni+不可达：块内所有分支均已 return（保留以满足编译器的全路径返回检查）
    return r;
}

void abort(int64_t owner_id, const std::string& upload_id) {
    std::lock_guard<std::mutex> lock(g_mutex);
    auto it = g_sessions.find(upload_id);
    if (it == g_sessions.end() || it->second.owner_id != owner_id) return;
    std::error_code ec;
    fs::remove(it->second.temp_path, ec);
    g_sessions.erase(it);
}

void prune_expired() {
    std::lock_guard<std::mutex> lock(g_mutex);
    prune_locked();
}

}
