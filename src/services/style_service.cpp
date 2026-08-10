#include "services/style_service.h"

#include "utils/config.h"
#include "utils/dashscope_client.h"
#include "utils/http_client.h"
#include "utils/logger.h"

#include <boost/json.hpp>

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <ctime>
#include <filesystem>
#include <fstream>
#include <map>
#include <mutex>
#include <random>
#include <thread>

namespace style_service {

namespace {

// @cuiruoni+内存任务表上限，超出删除最老任务
constexpr size_t kMaxTasks = 200;
// @cuiruoni+后台最大并发生成数，防止打爆 API 配额
constexpr int kMaxConcurrent = 2;
// @cuiruoni+排队等待并发槽位的最大时长，超时任务判失败（防止排队线程无限堆积）
constexpr int kQueueWaitSeconds = 120;
// @cuiruoni+待处理任务（pending + processing）总数上限，超限直接拒绝提交
constexpr size_t kMaxQueuedTasks = 50;
// @cuiruoni+任务轮询：间隔 3 秒，最多 120 次（约 6 分钟）
constexpr int kPollIntervalSeconds = 3;
constexpr int kMaxPollTimes = 120;
// @cuiruoni+连续网络错误（非任务失败）达到该次数才判失败，避免瞬时抖动误杀
constexpr int kMaxConsecutiveNetErrors = 3;
// @cuiruoni+已完成/失败任务的保留时长，超过后清理记录与文件
constexpr int kFinishedTaskRetainHours = 24;
// @cuiruoni+shutdown 最大等待秒数（须大于"轮询 sleep 3s + 查询超时"最坏时长）
constexpr int kShutdownWaitSeconds = 45;

std::mutex g_task_mutex;
std::map<std::string, StyleTask> g_tasks;

// @cuiruoni+并发槽位信号量
std::mutex g_sem_mutex;
std::condition_variable g_sem_cv;
int g_active = 0;
// @cuiruoni+仍在后台运行（含排队等待）的任务数，shutdown 时等待归零
int g_running_tasks = 0;
bool g_shutdown = false;

// @cuiruoni+风格注册表：id → (名称, 描述, 画幅)
struct StyleDef {
    std::string id;
    std::string name;
    std::string description;
    std::string ratio;
    std::string prompt; // @cuiruoni+英文生成指令模板
};

const std::vector<StyleDef>& style_defs() {
    static const std::vector<StyleDef> defs = {
        {
            "gathered",
            "实景拼贴 · Gathered Scenes",
            "保留照片真实场景为锚点，简化插画成场、单一高饱和色相、手撕纤维纸边，触感纸像海报",
            "3:5",
            "Transform this photograph into a calm tactile paper zine poster. "
            "Keep the photographic scene truthful as the anchor. "
            "Reinterpret selected source elements as a larger abstract illustration field instead of tracing them: "
            "compress foliage, branches, leaves and fine texture into a few large quiet graphic masses. "
            "Integrate ONE high-chroma hue as compositional structure, sharing source-derived shapes with the illustration. "
            "Preserve a visible hand-torn fibrous edge where photography becomes paper. "
            "Keep 55-75% of the illustration field quiet; active ink occupies 15-35% of the poster. "
            "One restrained micro-text element allowed. "
            "Flat scan look, cream paper, no mockup, no frame, no extra hues, no realistic shading. "
            "Output vertical 3:5 portrait poster."
        },
        {
            "distillation",
            "影像蒸馏 · Scene Distillation",
            "照片只作语义证据，重构成表达优先的极简艺术插画：情绪张力、视觉隐喻、大片留白、自由排版",
            "3:5",
            "Turn this photo into an expressive minimal zine poster illustration. "
            "Treat the photo as semantic evidence and creative stimulus only, never as a visual layer in the final image. "
            "Keep two to four source anchors: one core subject, one dominant gesture, one source-specific spatial cue. "
            "Remove 65-90% of descriptive detail; use editorial abstraction: simplified masses, broken contours, cut-paper forms, sparse marks. "
            "Build one central emotional tension and one visual metaphor from the source. "
            "68-85% quiet paper, one active illustration cluster about 12-32% of the canvas, "
            "one dominant mass plus one to three supporting forms. "
            "Use ONE art-directed high-chroma accent color as an emotional event. "
            "Unconstrained authorial typography: wording, language, placement and scale by expression. "
            "Flat, tactile, poetic, non-commercial; no photographic pixels, no filters, no tracing. "
            "Output vertical 3:5 canvas."
        },
    };
    return defs;
}

const StyleDef* find_style(const std::string& id) {
    for (const auto& def : style_defs()) {
        if (def.id == id) return &def;
    }
    return nullptr;
}

std::string now_string() {
    auto now = std::chrono::system_clock::now();
    std::time_t t = std::chrono::system_clock::to_time_t(now);
    std::tm tm{};
#ifdef _WIN32
    localtime_s(&tm, &t);
#else
    localtime_r(&t, &tm);
#endif
    char buf[32];
    std::strftime(buf, sizeof(buf), "%Y-%m-%d %H:%M:%S", &tm);
    return buf;
}

// @cuiruoni+解析 "YYYY-MM-DD HH:MM:SS" 为时间点，失败返回 epoch
std::chrono::system_clock::time_point parse_time(const std::string& s) {
    std::tm tm{};
#ifdef _WIN32
    if (sscanf_s(s.c_str(), "%d-%d-%d %d:%d:%d", &tm.tm_year, &tm.tm_mon, &tm.tm_mday,
                 &tm.tm_hour, &tm.tm_min, &tm.tm_sec) != 6) {
        return std::chrono::system_clock::time_point{};
    }
#else
    if (std::sscanf(s.c_str(), "%d-%d-%d %d:%d:%d", &tm.tm_year, &tm.tm_mon, &tm.tm_mday,
                    &tm.tm_hour, &tm.tm_min, &tm.tm_sec) != 6) {
        return std::chrono::system_clock::time_point{};
    }
#endif
    tm.tm_year -= 1900;
    tm.tm_mon -= 1;
    return std::chrono::system_clock::from_time_t(std::mktime(&tm));
}

// @cuiruoni+生成不可枚举的随机 task_id（16 字节随机数转 hex）
std::string make_task_id() {
    std::random_device rd;
    std::mt19937_64 gen(rd());
    std::uniform_int_distribution<uint64_t> dist;
    uint64_t a = dist(gen), b = dist(gen);
    char buf[33];
    std::snprintf(buf, sizeof(buf), "%016llx%016llx",
                  static_cast<unsigned long long>(a), static_cast<unsigned long long>(b));
    return buf;
}

void update_status(const std::string& task_id, const std::string& status,
                   const std::string& error = "", const std::string& result_url = "") {
    std::lock_guard<std::mutex> lock(g_task_mutex);
    auto it = g_tasks.find(task_id);
    if (it == g_tasks.end()) return;
    it->second.status = status;
    if (!error.empty()) it->second.error = error;
    if (!result_url.empty()) it->second.result_url = result_url;
}

// @cuiruoni+下载生成图并保存到本地，成功返回相对访问路径
bool save_result_image(const std::string& task_id, const std::string& image_url,
                       std::string& out_url) {
    auto resp = http_client::get(image_url, {}, 120);
    if (resp.status != 200 || resp.body.empty()) {
        spdlog::error("[style] download result image failed: http {} for {}",
                      resp.status, image_url);
        return false;
    }
    std::error_code ec;
    std::filesystem::create_directories(kUploadDir, ec);
    std::string filename = task_id + ".png";
    std::string path = std::string(kUploadDir) + "/" + filename;
    std::ofstream out(path, std::ios::binary | std::ios::trunc);
    if (!out) {
        spdlog::error("[style] cannot write result image: {}", path);
        return false;
    }
    out.write(resp.body.data(), static_cast<std::streamsize>(resp.body.size()));
    if (!out.good()) {
        out.close();
        std::error_code rm_ec;
        std::filesystem::remove(path, rm_ec); // @cuiruoni+写入失败时清理半成品文件
        spdlog::error("[style] write result image failed: {}", path);
        return false;
    }
    out.close();
    out_url = "/api/styles/file/" + filename;
    spdlog::info("[style] result image saved: {} ({} bytes)", path, resp.body.size());
    return true;
}

// @cuiruoni+清理超过保留时长的已完成/失败任务：删除内存记录并尝试删除磁盘文件
void prune_finished_tasks() {
    auto now = std::chrono::system_clock::now();
    std::vector<std::string> to_remove;
    {
        std::lock_guard<std::mutex> lock(g_task_mutex);
        for (auto it = g_tasks.begin(); it != g_tasks.end();) {
            const auto& t = it->second;
            if ((t.status == "done" || t.status == "failed") &&
                !t.created_at.empty()) {
                auto created = parse_time(t.created_at);
                if (created != std::chrono::system_clock::time_point{} &&
                    now - created > std::chrono::hours(kFinishedTaskRetainHours)) {
                    to_remove.push_back(t.id);
                    it = g_tasks.erase(it);
                    continue;
                }
            }
            ++it;
        }
    }
    for (const auto& id : to_remove) {
        std::error_code ec;
        std::filesystem::remove(std::string(kUploadDir) + "/" + id + ".png", ec);
    }
    if (!to_remove.empty()) {
        spdlog::info("[style] pruned {} finished tasks older than {}h", to_remove.size(),
                     kFinishedTaskRetainHours);
    }
}

void process_task(std::string task_id, std::string style,
                  std::string image_mime, std::string image_base64) {
    // @cuiruoni+运行计数已在 submit() 锁内登记，此处不再 ++；
    // @cuiruoni+running_guard 在任务结束时递减并唤醒 shutdown 等待者
    auto running_guard = [&]() {
        bool stop = false;
        {
            std::lock_guard<std::mutex> lock(g_sem_mutex);
            --g_running_tasks;
            stop = g_running_tasks == 0;
        }
        if (stop) g_sem_cv.notify_all();
    };

    // @cuiruoni+获取并发槽位：限时等待，超时或收到 shutdown 信号立即失败返回。
    // @cuiruoni+采用 wait_until 循环，保证 shutdown 后排队线程尽快退出（不等满 120s），
    // @cuiruoni+避免进程退出时 detached 线程访问已析构的全局状态。
    {
        std::unique_lock<std::mutex> lock(g_sem_mutex);
        auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(kQueueWaitSeconds);
        bool acquired = false;
        while (!g_shutdown) {
            if (g_active < kMaxConcurrent) {
                ++g_active;
                acquired = true;
                break;
            }
            if (g_sem_cv.wait_until(lock, deadline) == std::cv_status::timeout) break;
        }
        if (!acquired) {
            update_status(task_id, "failed", g_shutdown ? "服务正在关闭" : "系统繁忙，排队超时，请稍后重试");
            // @cuiruoni+P0修复：必须先释放 g_sem_mutex 再调用 running_guard()，
            // @cuiruoni+否则非递归 mutex 重复加锁导致死锁（排队超时/关闭路径必触发）
            lock.unlock();
            running_guard();
            return;
        }
    }

    update_status(task_id, "processing");

    const auto& cfg = Config::instance();
    const std::string api_key = cfg.get_string("dashscope_api_key", "");
    if (api_key.empty()) {
        update_status(task_id, "failed", "dashscope_api_key 未配置，请在 config.json 中填写百炼 API Key");
        {
            std::lock_guard<std::mutex> lock(g_sem_mutex);
            --g_active;
        }
        g_sem_cv.notify_one();
        running_guard();
        return;
    }
    const std::string model = cfg.get_string("dashscope_model", "wan2.7-image");

    const StyleDef* def = find_style(style);
    const std::string prompt = def ? def->prompt : style_defs().front().prompt;

    auto sub = dashscope::submit_image_edit(api_key, model, image_mime, image_base64, prompt);
    if (!sub.ok) {
        update_status(task_id, "failed", "提交生成任务失败：" + sub.error);
        {
            std::lock_guard<std::mutex> lock(g_sem_mutex);
            --g_active;
        }
        g_sem_cv.notify_one();
        running_guard();
        return;
    }
    spdlog::info("[style] task {} submitted to dashscope, task_id={}", task_id, sub.task_id);

    int net_errors = 0;
    for (int i = 0; i < kMaxPollTimes; ++i) {
        // @cuiruoni+shutdown 时提前退出轮询，避免进程退出后线程仍访问全局状态
        // @cuiruoni+锁序约定：全程仅允许 g_sem_mutex → g_task_mutex 单向获取（此处持 g_sem_mutex
        // @cuiruoni+调 update_status 获取 g_task_mutex 即为此约定），禁止反向，否则死锁
        {
            std::lock_guard<std::mutex> lock(g_sem_mutex);
            if (g_shutdown) {
                update_status(task_id, "failed", "服务正在关闭");
                break;
            }
        }
        std::this_thread::sleep_for(std::chrono::seconds(kPollIntervalSeconds));
        auto q = dashscope::query_task(api_key, sub.task_id);
        if (q.status == "SUCCEEDED" && !q.image_url.empty()) {
            std::string url;
            if (save_result_image(task_id, q.image_url, url)) {
                update_status(task_id, "done", "", url);
            } else {
                update_status(task_id, "failed", "生成成功但下载结果图失败");
            }
            break;
        }
        if (q.status == "FAILED") {
            // @cuiruoni+截断上游错误信息，避免原始响应细节直接回显前端
            std::string err = q.error;
            if (err.size() > 500) err.resize(500);
            update_status(task_id, "failed", "生成失败：" + err);
            break;
        }
        if (q.status.empty()) {
            // @cuiruoni+网络/解析错误：连续多次才判失败，避免瞬时抖动误杀
            if (++net_errors >= kMaxConsecutiveNetErrors) {
                update_status(task_id, "failed", "查询生成任务连续失败：" + q.error);
                break;
            }
            spdlog::warn("[style] task {} transient query error: {}", task_id, q.error);
            continue;
        }
        net_errors = 0; // @cuiruoni+PENDING / RUNNING，正常轮询
    }
    if (net_errors < kMaxConsecutiveNetErrors) {
        // @cuiruoni+循环自然结束 = 轮询超时
        auto t = style_service::StyleTask{};
        if (get_task(task_id, t) && t.status == "processing") {
            update_status(task_id, "failed", "生成超时（超过 6 分钟），请重试");
        }
    }

    {
        std::lock_guard<std::mutex> lock(g_sem_mutex);
        --g_active;
    }
    g_sem_cv.notify_one();
    running_guard();
}

} // namespace

std::vector<StyleInfo> list_styles() {
    std::vector<StyleInfo> out;
    for (const auto& def : style_defs()) {
        out.push_back({def.id, def.name, def.description, def.ratio});
    }
    return out;
}

std::string submit(const std::string& style, const std::string& image_mime,
                   const std::string& image_base64) {
    if (find_style(style) == nullptr) {
        spdlog::warn("[style] unknown style: {}", style);
        return "";
    }
    if (image_base64.empty()) {
        spdlog::warn("[style] empty image");
        return "";
    }

    // @cuiruoni+待处理任务上限检查（防 DoS / API 配额消耗）
    {
        std::lock_guard<std::mutex> lock(g_sem_mutex);
        if (g_shutdown) return "";
        // @cuiruoni+running = 排队 + 执行中，直接作为待处理计数
        if (g_running_tasks >= static_cast<int>(kMaxQueuedTasks)) {
            spdlog::warn("[style] queue full ({} tasks), reject submit", g_running_tasks);
            return "__QUEUE_FULL__";
        }
        // @cuiruoni+P1修复：在锁内登记运行任务数，与 shutdown 置位原子化，
        // @cuiruoni+避免"shutdown 已见 0、线程尚未登记"的窗口竞态（detached 线程访问已析构全局）
        ++g_running_tasks;
    }

    std::string task_id = make_task_id();

    {
        std::lock_guard<std::mutex> lock(g_task_mutex);
        StyleTask task;
        task.id = task_id;
        task.style = style;
        task.status = "pending";
        task.created_at = now_string();
        g_tasks[task_id] = std::move(task);

        // @cuiruoni+内存任务表上限控制：优先驱逐最老的已完成/失败任务（随机 hex key
        // @cuiruoni+与时间无关，不能按 key 顺序删）。极端情况下（全是活跃任务）退而删最老记录。
        while (g_tasks.size() > kMaxTasks) {
            std::string victim;
            std::string victim_created = "9999-99-99 99:99:99";
            for (const auto& [k, t] : g_tasks) {
                bool finished = t.status == "done" || t.status == "failed";
                if (!finished) continue;
                if (t.created_at < victim_created) {
                    victim_created = t.created_at;
                    victim = k;
                }
            }
            if (victim.empty()) {
                // @cuiruoni+没有可驱逐的已完成任务（不应发生：活跃任务上限远小于表上限）
                std::string oldest;
                std::string oldest_created = "9999-99-99 99:99:99";
                for (const auto& [k, t] : g_tasks) {
                    if (t.created_at < oldest_created) {
                        oldest_created = t.created_at;
                        oldest = k;
                    }
                }
                if (oldest.empty()) break;
                g_tasks.erase(oldest);
                break;
            }
            g_tasks.erase(victim);
            // @cuiruoni+同步删除对应磁盘文件，防止记录被驱逐后文件永久泄漏
            std::error_code rm_ec;
            std::filesystem::remove(std::string(kUploadDir) + "/" + victim + ".png", rm_ec);
        }
    }

    // @cuiruoni+顺带清理过期完成/失败任务（含磁盘文件）
    prune_finished_tasks();

    // @cuiruoni+后台线程执行（低频任务，简单起见每任务一线程，并发由信号量控制）
    std::thread(process_task, task_id, style, image_mime, image_base64).detach();

    return task_id;
}

bool get_task(const std::string& task_id, StyleTask& out) {
    std::lock_guard<std::mutex> lock(g_task_mutex);
    auto it = g_tasks.find(task_id);
    if (it == g_tasks.end()) return false;
    out = it->second;
    return true;
}

void init() {
    std::error_code ec;
    std::filesystem::create_directories(kUploadDir, ec);
    spdlog::info("[style] style service ready, upload dir: {}", kUploadDir);
}

void shutdown() {
    spdlog::info("[style] shutdown: waiting for background tasks...");
    std::unique_lock<std::mutex> lock(g_sem_mutex);
    g_shutdown = true;
    g_sem_cv.notify_all();
    if (!g_sem_cv.wait_for(lock, std::chrono::seconds(kShutdownWaitSeconds),
                           [] { return g_running_tasks == 0; })) {
        spdlog::warn("[style] shutdown timed out, {} task(s) still running", g_running_tasks);
    } else {
        spdlog::info("[style] all background tasks finished");
    }
}

}
