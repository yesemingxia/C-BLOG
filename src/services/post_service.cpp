#include "services/post_service.h"
#include "services/markdown_service.h"
#include "services/search_service.h"
#include "dao/post_dao.h"
#include "db/redis_pool.h"
#include "utils/logger.h"
#include "utils/sanitize.h"
#include "utils/storage.h"

#include <algorithm>
#include <chrono>
#include <filesystem>
#include <sstream>
#include <stdexcept>

namespace post_service {

// @cuiruoni+P0修复：UTF-8 安全截断（按"字符数"而不是"字节数"）。
// 背景：自动摘要原先用 content_md.substr(0, 200) —— substr 按**字节**切，
// 中文一个字 3 字节，200 字节处正好落在某个字中间 → summary 变成非法 UTF-8 →
// mysqlx 绑定报 "CDK Error: Failed string conversion"，整篇文章 500。
// **英文永远不会触发**（ASCII 任意切都合法），所以之前全部测试数据都没暴露；
// 用户一旦用中文写文章就必炸。修法：按 UTF-8 code point 数到 200 个字符再切，
// 每个字符的首字节决定序列长度，切点天然落在字符边界上。
static std::string utf8_truncate_chars(const std::string& s, size_t max_chars) {
    size_t count = 0;
    size_t i = 0;
    while (i < s.size() && count < max_chars) {
        const unsigned char b = static_cast<unsigned char>(s[i]);
        size_t len = 1;
        if ((b & 0xE0) == 0xC0) len = 2;
        else if ((b & 0xF0) == 0xE0) len = 3;
        else if ((b & 0xF8) == 0xF0) len = 4;
        // 非法序列（continuation byte 开头）：按 1 字符走，避免死循环
        if (i + len > s.size()) len = 1;
        i += len;
        count++;
    }
    return s.substr(0, i);
}

// @cuiruoni+按 UTF-8 code point 统计字符数，供阅读时长使用（与列表 SQL 的 CHAR_LENGTH 对齐）
static size_t utf8_length_chars(const std::string& s) {
    size_t count = 0;
    size_t i = 0;
    while (i < s.size()) {
        const unsigned char b = static_cast<unsigned char>(s[i]);
        size_t len = 1;
        if ((b & 0xE0) == 0xC0) len = 2;
        else if ((b & 0xF0) == 0xE0) len = 3;
        else if ((b & 0xF8) == 0xF0) len = 4;
        if (i + len > s.size()) len = 1;
        i += len;
        ++count;
    }
    return count;
}

json::object post_to_json(const Post& post) {
    json::array tags;
    for (const auto& tag : post.tags) {
        tags.push_back(json::value(tag));
    }

    int read_minutes = static_cast<int>((utf8_length_chars(post.content_md) + 499) / 500);
    if (read_minutes < 1) read_minutes = 1;

    return json::object{
        {"id", post.id},
        {"title", post.title},
        {"content_md", post.content_md},
        {"content_html", post.content_html},
        {"summary", post.summary},
        {"cover", post.cover},
        {"visibility", post.visibility},
        {"read_minutes", read_minutes},
        {"user_id", post.user_id},
        {"author", post.author},
        {"like_count", post.like_count},
        {"bookmark_count", post.bookmark_count},
        {"comment_count", post.comment_count},
        {"tags", tags},
        {"status", post.status},
        {"view_count", post.view_count},
        {"created_at", post.created_at},
        {"updated_at", post.updated_at}
    };
}

Post json_to_post(const json::object& obj) {
    Post p;
    // @cuiruoni+输入消毒：标题转义HTML防止XSS，截断过长字段
    if (obj.contains("title")) p.title = sanitize::truncate(sanitize::clean_text(
        std::string(obj.at("title").as_string())), 200);
    if (obj.contains("content_md")) p.content_md = std::string(obj.at("content_md").as_string());
    if (obj.contains("summary")) p.summary = sanitize::truncate(sanitize::clean_text(
        std::string(obj.at("summary").as_string())), 500);
    // @cuiruoni+封面：只允许 http/https/相对路径，safe_url 内部已截断到 500
    if (obj.contains("cover") && !obj.at("cover").is_null() && obj.at("cover").is_string()) {
        p.cover = sanitize::safe_url(std::string(obj.at("cover").as_string()));
    }
    // @cuiruoni+可见性：非法值显式抛错（由 controller 转 400），不能静默降级成 public
    if (obj.contains("visibility") && !obj.at("visibility").is_null()) {
        if (!obj.at("visibility").is_string()) {
            throw std::invalid_argument("visibility must be a string");
        }
        std::string visibility = std::string(obj.at("visibility").as_string());
        if (visibility != "public" && visibility != "members" && visibility != "private") {
            throw std::invalid_argument("Invalid visibility");
        }
        p.visibility = visibility;
    }
    if (obj.contains("tags") && obj.at("tags").is_array()) {
        for (const auto& tag : obj.at("tags").as_array()) {
            if (!tag.is_string()) continue;
            std::string name = sanitize::truncate(sanitize::clean_text(
                std::string(tag.as_string())), 50);
            if (!name.empty()) {
                p.tags.push_back(name);
            }
        }
    }
    if (obj.contains("user_id")) p.user_id = obj.at("user_id").as_int64();
    if (obj.contains("status")) p.status = std::string(obj.at("status").as_string());
    return p;
}

// @cuiruoni+B3：只解析请求里出现的字段；缺省字段不进入 patch，从而不会被清空
post_dao::PostPatch json_to_post_patch(const json::object& obj) {
    post_dao::PostPatch patch;

    auto take_string = [&](const char* key, size_t max_len, bool url_safe)
        -> std::optional<std::string> {
        auto it = obj.find(key);
        if (it == obj.end() || it->value().is_null()) return std::nullopt;
        if (!it->value().is_string()) {
            throw std::invalid_argument(std::string(key) + " must be a string");
        }
        std::string raw(it->value().as_string());
        return url_safe
            ? sanitize::safe_url(raw)
            : sanitize::truncate(sanitize::clean_text(raw), max_len);
    };

    patch.title = take_string("title", 200, false);
    patch.summary = take_string("summary", 500, false);
    patch.cover = take_string("cover", 500, true);

    // @cuiruoni+B3：正文保持原样 —— 不能走 clean_text，否则会吃掉首尾空白/缩进，
    // @cuiruoni+而 Markdown 的缩进代码块依赖这些空格（与 json_to_post 的创建路径保持一致）
    auto content_it = obj.find("content_md");
    if (content_it != obj.end() && !content_it->value().is_null()) {
        if (!content_it->value().is_string()) {
            throw std::invalid_argument("content_md must be a string");
        }
        patch.content_md = std::string(content_it->value().as_string());
    }

    if (auto status = take_string("status", 20, false)) {
        if (*status != "draft" && *status != "published") {
            throw std::invalid_argument("Invalid status");
        }
        patch.status = *status;
    }

    auto visibility_it = obj.find("visibility");
    if (visibility_it != obj.end() && !visibility_it->value().is_null()) {
        if (!visibility_it->value().is_string()) {
            throw std::invalid_argument("visibility must be a string");
        }
        std::string visibility(visibility_it->value().as_string());
        if (visibility != "public" && visibility != "members" && visibility != "private") {
            throw std::invalid_argument("Invalid visibility");
        }
        patch.visibility = visibility;
    }

    auto tags_it = obj.find("tags");
    if (tags_it != obj.end() && !tags_it->value().is_null()) {
        if (!tags_it->value().is_array()) {
            throw std::invalid_argument("tags must be an array");
        }
        std::vector<std::string> tags;
        for (const auto& tag : tags_it->value().as_array()) {
            if (!tag.is_string()) continue;
            std::string name = sanitize::truncate(
                sanitize::clean_text(std::string(tag.as_string())), 50);
            if (!name.empty()) tags.push_back(std::move(name));
        }
        patch.tags = std::move(tags);
    }

    return patch;
}

// @cuiruoni+分页查询文章列表，支持按status过滤，返回文章摘要信息
// @cuiruoni+先查总数再查列表，避免两次全量查询
json::array list_posts(int page, int page_size, const std::string& status, int& total,
                       int64_t viewer_id, bool is_admin) {
    try {
        return post_dao::list_posts(page, page_size, status, total, viewer_id, is_admin);
    } catch (const std::exception& e) {
        spdlog::error("list_posts error: {}", e.what());
        return json::array{};
    }
}

// @cuiruoni+获取单篇文章详情，increment_view控制是否自增浏览量
Post get_post(int64_t id, bool increment_view) {
    try {
        Post p = post_dao::find_by_id(id);
        if (p.id == 0) return p;

        // @cuiruoni+浏览量自增：每次读取文章详情时+1，非原子操作但在单线程io_context下安全
        if (increment_view) {
            post_dao::increment_view_count(id);
        }

        return p;
    } catch (const std::exception& e) {
        spdlog::error("get_post error: {}", e.what());
        return Post{};
    }
}

// @cuiruoni+单独增加浏览量，供controller层基于Redis去重后调用
void increment_view_count(int64_t id) {
    try {
        post_dao::increment_view_count(id);
    } catch (const std::exception& e) {
        spdlog::error("increment_view_count error: {}", e.what());
    }
}

// @cuiruoni+创建文章：自动将Markdown渲染为HTML，未提供摘要时截取前200字符
int64_t create_post(const Post& post) {
    try {
        // @cuiruoni+Markdown→HTML渲染，使用cmark库转换
        std::string html = markdown_service::render(post.content_md);
        // @cuiruoni+自动摘要：未提供摘要时截取Markdown原文前200个字符
        //（必须走 UTF-8 安全截断 —— 原先 substr(0,200) 按字节切会把中文切成非法序列，
        // 导致 mysqlx "Failed string conversion"，中文文章发布 500）
        std::string summary = post.summary;
        if (summary.empty() && post.content_md.size() > 200) {
            summary = utf8_truncate_chars(post.content_md, 200);
        } else if (summary.empty()) {
            summary = post.content_md;
        }

        int64_t id = post_dao::insert(post, html, summary);

        // @cuiruoni+创建文章后同步标签关联到post_tags表
        // @cuiruoni+id 必须先判：insert 失败返回 0，此时 sync_tags(0, …) 会往 post_tags 插
        // @cuiruoni+post_id=0 的行，外键直接报错（还被 sync_tags 内部吞掉），
        // @cuiruoni+日志里凭空多一条和真实故障无关的 SQL 异常，排查时容易带偏。
        if (id > 0 && !post.tags.empty()) {
            post_dao::sync_tags(id, post.tags);
        }

        // @cuiruoni+A2：新文章可能命中已有搜索词，递增 epoch 让匿名搜索缓存立即失效
        if (id > 0) search_service::invalidate_cache();
        return id;
    } catch (const std::exception& e) {
        spdlog::error("create_post error: {}", e.what());
        return 0;
    }
}

// @cuiruoni+B3：部分更新 —— 只有正文出现时才重新渲染 HTML，只有 tags 出现时才同步标签
bool update_post_patch(int64_t id, const post_dao::PostPatch& patch) {
    try {
        std::string html;
        if (patch.content_md) html = markdown_service::render(*patch.content_md);

        if (!post_dao::update_patch(id, patch, html)) return false;
        if (patch.tags) post_dao::sync_tags(id, *patch.tags);

        // @cuiruoni+A2：正文/可见性/标签可能变化，搜索缓存必须整体作废
        search_service::invalidate_cache();
        return true;
    } catch (const std::exception& e) {
        spdlog::error("update_post_patch error: {}", e.what());
        return false;
    }
}

bool delete_post(int64_t id) {
    try {
        // @cuiruoni+B1 残留：先把这篇引用的图片记下来 —— 删完就查不到内容了
        const std::vector<std::string> media_texts = post_dao::list_media_texts(id, 0);

        bool ok = post_dao::delete_by_id(id);
        if (ok) {
            search_service::invalidate_cache();
            reclaim_images(media_texts);
        }
        return ok;
    } catch (const std::exception& e) {
        spdlog::error("delete_post error: {}", e.what());
        return false;
    }
}

size_t reclaim_images(const std::vector<std::string>& media_texts) {
    size_t removed = 0;
    try {
        std::vector<std::string> names;
        for (const auto& text : media_texts) {
            for (const auto& name : storage::extract_image_names(text)) {
                if (std::find(names.begin(), names.end(), name) == names.end()) {
                    names.push_back(name);
                }
            }
        }

        for (const auto& name : names) {
            // @cuiruoni+>0 = 还有别的内容在用这张图（同一张图被复制进多篇文章很常见）；
            // @cuiruoni+-1 = 查询本身失败。两种都**不能删**：这里的代价不对称，
            // @cuiruoni+留一个孤儿文件只是占磁盘，删错一张是别人页面上的图永久 404。
            const int refs = post_dao::count_image_references(name);
            if (refs != 0) continue;
            if (storage::remove_image(name)) {
                ++removed;
                spdlog::info("[media] reclaimed orphan image {}", name);
            }
        }
    } catch (const std::exception& e) {
        spdlog::error("reclaim_images error: {}", e.what());
    }
    return removed;
}

size_t sweep_orphan_images(int min_age_seconds) {
    namespace fs = std::filesystem;
    size_t removed = 0;
    try {
        std::error_code ec;
        fs::directory_iterator it(storage::images(), ec), end;
        if (ec) return 0;  // 目录还没建（从没上传过图片）

        const auto now = fs::file_time_type::clock::now();
        const auto min_age = std::chrono::seconds(min_age_seconds > 0 ? min_age_seconds : 0);

        for (; !ec && it != end; it.increment(ec)) {
            const fs::path path = it->path();
            std::error_code type_ec;
            if (!fs::is_regular_file(path, type_ec) || type_ec) continue;

            const std::string name = path.filename().string();
            // @cuiruoni+不是我们生成的文件名就永不碰：别人的备份、手工放进去的文件都算在内
            if (!storage::is_safe_image_name(name)) continue;

            std::error_code time_ec;
            const auto mtime = fs::last_write_time(path, time_ec);
            if (time_ec) continue;
            // @cuiruoni+安全闸：太新的不动。用户传完图可能正在写文章（甚至第二天才发），
            // @cuiruoni+这段时间里数据库里没有任何引用是正常的，删了就是把人家的图吃了
            if (now - mtime < min_age) continue;

            const int refs = post_dao::count_image_references(name);
            if (refs != 0) continue;  // >0 仍被引用；-1 查询失败，同样按「仍在引用」处理

            if (storage::remove_image(name)) {
                ++removed;
                spdlog::info("[media] swept orphan image {} (unreferenced)", name);
            }
        }
        if (removed > 0) {
            spdlog::info("[media] swept {} orphan image(s) from {}", removed, storage::images());
        }
    } catch (const std::exception& e) {
        spdlog::error("sweep_orphan_images error: {}", e.what());
    }
    return removed;
}

bool can_modify_post(int64_t post_id, int64_t user_id, const std::string& role) {
    if (role == "admin") return true;

    try {
        int64_t post_user_id = post_dao::find_user_id(post_id);
        return post_user_id == user_id;
    } catch (const std::exception& e) {
        spdlog::error("can_modify_post error: {}", e.what());
        return false;
    }
}

}
