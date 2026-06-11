#include "services/post_service.h"
#include "services/markdown_service.h"
#include "dao/post_dao.h"
#include "db/redis_pool.h"
#include "utils/logger.h"
#include "utils/sanitize.h"

#include <sstream>

namespace post_service {

json::object post_to_json(const Post& post) {
    json::array tags;
    for (const auto& tag : post.tags) {
        tags.push_back(json::value(tag));
    }

    return json::object{
        {"id", post.id},
        {"title", post.title},
        {"content_md", post.content_md},
        {"content_html", post.content_html},
        {"summary", post.summary},
        {"user_id", post.user_id},
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

// @cuiruoni+分页查询文章列表，支持按status过滤，返回文章摘要信息
// @cuiruoni+先查总数再查列表，避免两次全量查询
json::array list_posts(int page, int page_size, const std::string& status, int& total) {
    try {
        return post_dao::list_posts(page, page_size, status, total);
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
        // @cuiruoni+自动摘要：未提供摘要时截取Markdown原文前200字符
        std::string summary = post.summary;
        if (summary.empty() && post.content_md.size() > 200) {
            summary = post.content_md.substr(0, 200);
        } else if (summary.empty()) {
            summary = post.content_md;
        }

        int64_t id = post_dao::insert(post, html, summary);

        // @cuiruoni+创建文章后同步标签关联到post_tags表
        if (!post.tags.empty()) {
            post_dao::sync_tags(id, post.tags);
        }

        return id;
    } catch (const std::exception& e) {
        spdlog::error("create_post error: {}", e.what());
        return 0;
    }
}

// @cuiruoni+更新文章：重新渲染Markdown→HTML
bool update_post(int64_t id, const Post& post) {
    try {
        std::string html = markdown_service::render(post.content_md);
        post_dao::update(id, post, html);

        // @cuiruoni+更新文章后同步标签关联
        post_dao::sync_tags(id, post.tags);

        return true;
    } catch (const std::exception& e) {
        spdlog::error("update_post error: {}", e.what());
        return false;
    }
}

bool delete_post(int64_t id) {
    try {
        return post_dao::delete_by_id(id);
    } catch (const std::exception& e) {
        spdlog::error("delete_post error: {}", e.what());
        return false;
    }
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
