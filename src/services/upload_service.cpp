#include "services/upload_service.h"

#include "services/style_service.h"
#include "utils/logger.h"

#include <chrono>
#include <filesystem>
#include <fstream>
#include <map>
#include <mutex>
#include <random>

namespace upload_service {

namespace {

// @cuiruoni+临时分片存储目录
constexpr const char* kTmpDir = "uploads/tmp";
// @cuiruoni+原图大小上限（与前端 10MB 限制一致，留余量）
constexpr size_t kMaxFileSize = 12 * 1024 * 1024;
// @cuiruoni+会话过期时间：超过即清理（含临时文件）
constexpr int kSessionTtlMinutes = 30;
// @cuiruoni+内存会话上限：防批量创建拖垮内存/磁盘
constexpr size_t kMaxSessions = 1000;

struct UploadSession {
    std::string id;
    int64_t owner_id = 0;
    std::string mime;
    std::string file_path;
    size_t file_size = 0;
    size_t received = 0;
    std::chrono::steady_clock::time_point created = std::chrono::steady_clock::now();
};

std::mutex g_mutex;
std::map<std::string, UploadSession> g_sessions;

std::string make_upload_id() {
    std::random_device rd;
    std::mt19937_64 gen(rd());
    std::uniform_int_distribution<uint64_t> dist;
    char buf[33];
    std::snprintf(buf, sizeof(buf), "%016llx%016llx",
                  static_cast<unsigned long long>(dist(gen)),
                  static_cast<unsigned long long>(dist(gen)));
    return buf;
}

bool is_valid_mime(const std::string& mime) {
    static const std::vector<std::string> allowed = {
        "image/png", "image/jpeg", "image/webp", "image/gif", "image/bmp"
    };
    for (const auto& m : allowed) {
        if (mime == m) return true;
    }
    return false;
}

// @cuiruoni+检测图片 magic bytes 对应的 MIME（与声明 mime 比对用），非图片返回空串
std::string detect_image_mime(const std::string& data) {
    if (data.size() < 8) return "";
    const unsigned char* b = reinterpret_cast<const unsigned char*>(data.data());
    if (b[0] == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G') return "image/png";
    if (b[0] == 0xFF && b[1] == 0xD8 && b[2] == 0xFF) return "image/jpeg";
    if (b[0] == 'R' && b[1] == 'I' && b[2] == 'F' && b[3] == 'F' && data.size() >= 12 &&
        data[8] == 'W' && data[9] == 'E' && data[10] == 'B' && data[11] == 'P') return "image/webp";
    if (b[0] == 'G' && b[1] == 'I' && b[2] == 'F') return "image/gif";
    if (b[0] == 'B' && b[1] == 'M') return "image/bmp";
    return "";
}

void remove_session_locked(const std::string& id) {
    auto it = g_sessions.find(id);
    if (it == g_sessions.end()) return;
    std::error_code ec;
    std::filesystem::remove(it->second.file_path, ec);
    g_sessions.erase(it);
}

} // namespace

InitResult init(int64_t owner_id, size_t file_size, const std::string& mime) {
    InitResult result;
    if (file_size == 0 || file_size > kMaxFileSize) {
        result.error = "文件大小必须大于 0 且不超过 12MB";
        return result;
    }
    if (!is_valid_mime(mime)) {
        result.error = "不支持的图片格式";
        return result;
    }

    prune_expired();

    {
        std::lock_guard<std::mutex> lock(g_mutex);
        if (g_sessions.size() >= kMaxSessions) {
            result.error = "上传会话过多，请稍后重试";
            return result;
        }
    }

    std::error_code ec;
    std::filesystem::create_directories(kTmpDir, ec);

    std::string id = make_upload_id();
    UploadSession sess;
    sess.id = id;
    sess.owner_id = owner_id;
    sess.mime = mime;
    sess.file_size = file_size;
    sess.file_path = std::string(kTmpDir) + "/" + id + ".part";

    {
        std::lock_guard<std::mutex> lock(g_mutex);
        g_sessions[id] = std::move(sess);
    }

    result.ok = true;
    result.upload_id = id;
    result.chunk_received = 0;
    spdlog::info("[upload] session {} created by user {}, size={} mime={}", id, owner_id,
                 file_size, mime);
    return result;
}

AppendResult append(int64_t owner_id, const std::string& upload_id, size_t start, size_t end,
                    const char* data, size_t len) {
    AppendResult result;
    if (!data || len == 0 || end < start) {
        result.http_status = 400;
        result.error = "非法分片参数";
        return result;
    }
    // @cuiruoni+P1修复：Content-Range 声称范围必须与实际 body 长度一致，防止
    // @cuiruoni+"范围大、body 小"的恶意请求触发指针越界/无符号下溢（UB）
    if (len != end - start + 1) {
        result.http_status = 400;
        result.error = "分片长度与 Content-Range 不一致";
        return result;
    }

    std::unique_lock<std::mutex> lock(g_mutex);
    auto it = g_sessions.find(upload_id);
    if (it == g_sessions.end()) {
        lock.unlock();
        result.http_status = 404;
        result.error = "上传会话不存在或已过期";
        return result;
    }
    auto& sess = it->second;
    if (sess.owner_id != owner_id) {
        lock.unlock();
        result.http_status = 403;
        result.error = "无权操作该上传会话";
        return result;
    }

    // @cuiruoni+幂等：重复发送已接收范围内的分片（网络重试场景）→ 直接返回当前进度
    if (start < sess.received) {
        if (end <= sess.received) {
            result.ok = true;
            result.received = sess.received;
            return result;
        }
        // @cuiruoni+部分重叠（异常）：跳过已收部分；防御性检查避免 skip >= len
        size_t skip = sess.received - start;
        if (skip >= len) {
            result.ok = true;
            result.received = sess.received;
            return result;
        }
        start = sess.received;
        data += skip;
        len -= skip;
    }

    if (start > sess.received) {
        lock.unlock();
        result.http_status = 409;
        result.error = "分片顺序错误，请从断点 " + std::to_string(sess.received) + " 续传";
        result.received = sess.received;
        return result;
    }
    // @cuiruoni+end 为闭区间：end == file_size-1 是最后一片（合法），end >= file_size 越界
    if (end >= sess.file_size) {
        lock.unlock();
        result.http_status = 400;
        result.error = "分片超出文件大小";
        return result;
    }
    if (start + len > sess.file_size) {
        lock.unlock();
        result.http_status = 400;
        result.error = "分片超出文件大小";
        return result;
    }

    // @cuiruoni+追加写入（严格顺序模型，write 前已确认 start == received）
    std::ofstream out(sess.file_path, std::ios::binary | std::ios::app);
    if (!out) {
        lock.unlock();
        result.http_status = 500;
        result.error = "临时文件写入失败";
        return result;
    }
    out.write(data, static_cast<std::streamsize>(len));
    out.flush();
    if (!out.good()) {
        out.close();
        lock.unlock();
        result.http_status = 500;
        result.error = "临时文件写入失败";
        return result;
    }
    out.close();

    sess.received = start + len;
    result.ok = true;
    result.received = sess.received;
    return result;
}

QueryResult query(int64_t owner_id, const std::string& upload_id) {
    QueryResult result;
    std::lock_guard<std::mutex> lock(g_mutex);
    auto it = g_sessions.find(upload_id);
    if (it == g_sessions.end()) {
        result.http_status = 404;
        result.error = "上传会话不存在或已过期";
        return result;
    }
    if (it->second.owner_id != owner_id) {
        result.http_status = 403;
        result.error = "无权操作该上传会话";
        return result;
    }
    result.ok = true;
    result.upload_id = it->second.id;
    result.mime = it->second.mime;
    result.file_size = it->second.file_size;
    result.received = it->second.received;
    return result;
}

CompleteResult complete(int64_t owner_id, const std::string& upload_id, const std::string& style) {
    CompleteResult result;

    QueryResult q = query(owner_id, upload_id);
    if (!q.ok) {
        result.http_status = q.http_status;
        result.error = q.error;
        return result;
    }
    if (q.received != q.file_size) {
        result.http_status = 400;
        result.error = "文件未上传完成（" + std::to_string(q.received) + "/" +
                       std::to_string(q.file_size) + "）";
        return result;
    }

    // @cuiruoni+读取合并后的完整文件（先取路径再解锁读取，避免持锁 IO）
    std::string file_path;
    {
        std::lock_guard<std::mutex> lock(g_mutex);
        auto it = g_sessions.find(upload_id);
        if (it == g_sessions.end()) {
            result.http_status = 404;
            result.error = "上传会话不存在或已过期";
            return result;
        }
        file_path = it->second.file_path;
    }

    std::ifstream in(file_path, std::ios::binary);
    if (!in) {
        result.http_status = 500;
        result.error = "读取上传文件失败";
        return result;
    }
    std::string content((std::istreambuf_iterator<char>(in)), std::istreambuf_iterator<char>());
    in.close();

    // @cuiruoni+内容完整性与格式校验：大小一致 + magic bytes 与声明 MIME 一致
    std::string detected = detect_image_mime(content);
    if (content.size() != q.file_size || detected.empty() || detected != q.mime) {
        std::error_code ec;
        std::filesystem::remove(file_path, ec);
        {
            std::lock_guard<std::mutex> lock(g_mutex);
            g_sessions.erase(upload_id);
        }
        result.http_status = 400;
        result.error = "文件校验失败（内容不完整或与声明格式不符）";
        return result;
    }

    // @cuiruoni+转 base64 提交生成任务（与旧 JSON 上传路径共用 style_service）
    static const char* kBase64Chars =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    std::string b64;
    b64.reserve((content.size() + 2) / 3 * 4);
    size_t i = 0;
    for (; i + 3 <= content.size(); i += 3) {
        uint32_t n = (static_cast<unsigned char>(content[i]) << 16) |
                     (static_cast<unsigned char>(content[i + 1]) << 8) |
                     static_cast<unsigned char>(content[i + 2]);
        b64.push_back(kBase64Chars[(n >> 18) & 63]);
        b64.push_back(kBase64Chars[(n >> 12) & 63]);
        b64.push_back(kBase64Chars[(n >> 6) & 63]);
        b64.push_back(kBase64Chars[n & 63]);
    }
    size_t rem = content.size() - i;
    if (rem == 1) {
        uint32_t n = static_cast<unsigned char>(content[i]) << 16;
        b64.push_back(kBase64Chars[(n >> 18) & 63]);
        b64.push_back(kBase64Chars[(n >> 12) & 63]);
        b64.push_back('=');
        b64.push_back('=');
    } else if (rem == 2) {
        uint32_t n = (static_cast<unsigned char>(content[i]) << 16) |
                     (static_cast<unsigned char>(content[i + 1]) << 8);
        b64.push_back(kBase64Chars[(n >> 18) & 63]);
        b64.push_back(kBase64Chars[(n >> 12) & 63]);
        b64.push_back(kBase64Chars[(n >> 6) & 63]);
        b64.push_back('=');
    }

    // @cuiruoni+提交任务。队列满等失败时保留会话与分片，前端可稍后重试 complete
    std::string task_id = style_service::submit(style, q.mime, b64);
    if (task_id == "__QUEUE_FULL__") {
        result.http_status = 503;
        result.error = "系统繁忙，请稍后重试";
        return result;
    }
    if (task_id.empty()) {
        result.http_status = 400;
        result.error = "不支持的风格";
        return result;
    }

    // @cuiruoni+提交成功后才清理会话与临时文件
    {
        std::lock_guard<std::mutex> lock(g_mutex);
        remove_session_locked(upload_id);
    }
    result.ok = true;
    result.task_id = task_id;
    return result;
}

void prune_expired() {
    auto now = std::chrono::steady_clock::now();
    std::vector<std::string> expired;
    {
        std::lock_guard<std::mutex> lock(g_mutex);
        for (auto it = g_sessions.begin(); it != g_sessions.end();) {
            if (now - it->second.created > std::chrono::minutes(kSessionTtlMinutes)) {
                expired.push_back(it->first);
                it = g_sessions.erase(it);
            } else {
                ++it;
            }
        }
    }
    for (const auto& id : expired) {
        std::error_code ec;
        std::filesystem::remove(std::string(kTmpDir) + "/" + id + ".part", ec);
    }

    // @cuiruoni+Nit修复：进程崩溃遗留的 .part 文件（无内存会话）按 mtime 清理
    std::error_code ec;
    if (std::filesystem::exists(kTmpDir, ec)) {
        for (const auto& entry : std::filesystem::directory_iterator(kTmpDir, ec)) {
            if (!entry.is_regular_file(ec)) continue;
            auto path = entry.path();
            if (path.extension() != ".part") continue;
            auto mtime = std::filesystem::last_write_time(path, ec);
            if (ec) continue;
            // @cuiruoni+同一时钟（file_time_type::clock，C++17 兼容）相减计算文件年龄
            auto age = std::chrono::duration_cast<std::chrono::minutes>(
                std::filesystem::file_time_type::clock::now() - mtime);
            if (age.count() > kSessionTtlMinutes) {
                std::filesystem::remove(path, ec);
                spdlog::info("[upload] removed orphan tmp file: {}", path.string());
            }
        }
    }

    if (!expired.empty()) {
        spdlog::info("[upload] pruned {} expired sessions", expired.size());
    }
}

}
