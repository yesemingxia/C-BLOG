#include "controllers/admin_controller.h"

#include "dao/user_dao.h"
#include "dao/post_dao.h"
#include "dao/comment_dao.h"
#include "dao/contact_dao.h"
#include "dao/video_dao.h"
#include "services/auth_service.h"
#include "services/post_service.h"
#include "services/search_service.h"
#include "utils/logger.h"
#include "utils/response.h"
#include "utils/sanitize.h"
#include "utils/storage.h"

#include <boost/json.hpp>
#include <filesystem>

namespace json = boost::json;
namespace http = boost::beast::http;

namespace {

// @cuiruoni+B6：后台搜索词统一消毒/截断，空串表示不过滤
std::string query_text(const RouteParams& params, const char* key) {
    auto it = params.query.find(key);
    if (it == params.query.end()) return "";
    return sanitize::truncate(sanitize::clean_text(it->second), 100);
}

std::string query_sort(const RouteParams& params) {
    auto it = params.query.find("sort");
    return it != params.query.end() ? it->second : "created_at";
}

std::string query_order(const RouteParams& params) {
    auto it = params.query.find("order");
    return it != params.query.end() ? it->second : "desc";
}

} // namespace

// @cuiruoni+管理员仪表盘统计：返回用户数、文章数、评论数、已发布/草稿文章数
static http::response<http::string_body> handle_admin_stats(
    const http::request<http::string_body>& req, const RouteParams& params) {
    int64_t user_id = 0;
    std::string username, role;
    if (!auth_service::extract_admin_from_token(req, user_id, username, role)) {
        http::response<http::string_body> res{http::status::forbidden, req.version()};
        res.body() = response::error(403, "Admin access required");
        res.prepare_payload();
        return res;
    }

    try {
        // @cuiruoni+分别统计各表记录数，published/draft为文章状态子统计
        int64_t total_users = user_dao::count_all();
        int64_t total_posts = post_dao::count_all();
        int64_t total_comments = comment_dao::count_all();
        int64_t published_posts = post_dao::count_by_status("published");
        int64_t draft_posts = post_dao::count_by_status("draft");

            json::object data;
        data["total_users"] = total_users;
        data["total_posts"] = total_posts;
        data["total_comments"] = total_comments;
        data["published_posts"] = published_posts;
        data["draft_posts"] = draft_posts;

        http::response<http::string_body> res{http::status::ok, req.version()};
        res.body() = response::success(data);
        res.prepare_payload();
        return res;
    } catch (const std::exception& e) {
        spdlog::error("Admin stats error: {}", e.what());
        http::response<http::string_body> res{http::status::internal_server_error, req.version()};
        res.body() = response::error(500, "Internal server error");
        res.prepare_payload();
        return res;
    }
}

// @cuiruoni+B8：近 N 个月文章发布趋势（默认 12 个月，空月份补 0）
static http::response<http::string_body> handle_admin_stats_trend(
    const http::request<http::string_body>& req, const RouteParams& params) {
    int64_t admin_id = 0;
    std::string username, role;
    if (!auth_service::extract_admin_from_token(req, admin_id, username, role)) {
        http::response<http::string_body> res{http::status::forbidden, req.version()};
        res.body() = response::error(403, "Admin access required");
        res.prepare_payload();
        return res;
    }

    int months = 12;
    auto it = params.query.find("months");
    if (it != params.query.end() && !it->second.empty()) {
        months = sanitize::safe_stoi(it->second, 12);
    }
    months = sanitize::clamp_int(months, 1, 24);

    try {
        json::array points = post_dao::count_monthly_published(months);
        json::object data;
        data["months"] = months;
        data["points"] = std::move(points);

        http::response<http::string_body> res{http::status::ok, req.version()};
        res.body() = response::success(json::value(std::move(data)));
        res.prepare_payload();
        return res;
    } catch (const std::exception& e) {
        spdlog::error("Admin stats trend error: {}", e.what());
        http::response<http::string_body> res{http::status::internal_server_error, req.version()};
        res.body() = response::error(500, "Internal server error");
        res.prepare_payload();
        return res;
    }
}

// @cuiruoni+管理员查看所有用户列表，支持分页，不返回password_hash和salt
static http::response<http::string_body> handle_admin_list_users(
    const http::request<http::string_body>& req, const RouteParams& params) {
    int64_t admin_id = 0;
    std::string username, role;
    if (!auth_service::extract_admin_from_token(req, admin_id, username, role)) {
        http::response<http::string_body> res{http::status::forbidden, req.version()};
        res.body() = response::error(403, "Admin access required");
        res.prepare_payload();
        return res;
    }

    int page = 1, page_size = 10;
    // @cuiruoni+从查询参数中提取分页条件
    auto it = params.query.find("page");
    if (it != params.query.end() && !it->second.empty()) page = sanitize::safe_stoi(it->second);
    it = params.query.find("page_size");
    if (it != params.query.end() && !it->second.empty()) page_size = sanitize::safe_stoi(it->second);
    page = sanitize::clamp_page(page);
    page_size = sanitize::clamp_page_size(page_size, 10);

    try {
        int total = 0;
        // @cuiruoni+B6/B7：q 为服务端搜索，sort/order 由 DAO 白名单映射
        json::array arr = user_dao::list_users(page, page_size, total,
            query_text(params, "q"), query_sort(params), query_order(params));

        json::object data;
        data["users"] = std::move(arr);
        data["total"] = total;
        data["page"] = page;
        data["page_size"] = page_size;

        http::response<http::string_body> res{http::status::ok, req.version()};
        res.body() = response::success(data);
        res.prepare_payload();
        return res;
    } catch (const std::exception& e) {
        spdlog::error("Admin list users error: {}", e.what());
        http::response<http::string_body> res{http::status::internal_server_error, req.version()};
        res.body() = response::error(500, "Internal server error");
        res.prepare_payload();
        return res;
    }
}

// @cuiruoni+管理员修改用户角色，不能修改自己的角色
static http::response<http::string_body> handle_admin_change_user_role(
    const http::request<http::string_body>& req, const RouteParams& params) {
    int64_t admin_id = 0;
    std::string username, role;
    if (!auth_service::extract_admin_from_token(req, admin_id, username, role)) {
        http::response<http::string_body> res{http::status::forbidden, req.version()};
        res.body() = response::error(403, "Admin access required");
        res.prepare_payload();
        return res;
    }

    auto it = params.path.find("id");
    if (it == params.path.end()) {
        http::response<http::string_body> res{http::status::bad_request, req.version()};
        res.body() = response::error(400, "Missing user id");
        res.prepare_payload();
        return res;
    }

    int64_t target_id = sanitize::safe_stoll(it->second);

    // @cuiruoni+管理员不能修改自己的角色，防止误操作导致失去管理员权限
    if (target_id == admin_id) {
        http::response<http::string_body> res{http::status::bad_request, req.version()};
        res.body() = response::error(400, "Cannot change your own role");
        res.prepare_payload();
        return res;
    }

    try {
        auto body = json::parse(req.body()).as_object();
        std::string new_role = std::string(body["role"].as_string());

        // @cuiruoni+只允许admin和user两种角色值
        if (new_role != "admin" && new_role != "user") {
            http::response<http::string_body> res{http::status::bad_request, req.version()};
            res.body() = response::error(400, "Invalid role, must be 'admin' or 'user'");
            res.prepare_payload();
            return res;
        }

        // @cuiruoni+先检查目标用户是否存在
        if (!user_dao::exists_by_id(target_id)) {
                http::response<http::string_body> res{http::status::not_found, req.version()};
            res.body() = response::error(404, "User not found");
            res.prepare_payload();
            return res;
        }

        // @cuiruoni+原来忽略返回值：写库失败时前端已经把角色渲染成「管理员」，
        // @cuiruoni+刷新后又变回「普通用户」，看起来像权限设置莫名其妙丢了。失败直接 500。
        if (!user_dao::update_role(target_id, new_role)) {
            spdlog::error("Admin update role failed at DAO layer, target_id={}", target_id);
            http::response<http::string_body> res{http::status::internal_server_error, req.version()};
            res.body() = response::error(500, "Failed to update user role");
            res.prepare_payload();
            return res;
        }

        http::response<http::string_body> res{http::status::ok, req.version()};
        res.body() = response::success(std::string("User role updated"));
        res.prepare_payload();
        return res;
    } catch (const std::exception& e) {
        spdlog::error("Admin change user role error: {}", e.what());
        http::response<http::string_body> res{http::status::bad_request, req.version()};
        res.body() = response::error(400, "Invalid request body");
        res.prepare_payload();
        return res;
    }
}

// @cuiruoni+管理员删除用户，不能删除自己，依赖数据库外键级联删除关联数据
static http::response<http::string_body> handle_admin_delete_user(
    const http::request<http::string_body>& req, const RouteParams& params) {
    int64_t admin_id = 0;
    std::string username, role;
    if (!auth_service::extract_admin_from_token(req, admin_id, username, role)) {
        http::response<http::string_body> res{http::status::forbidden, req.version()};
        res.body() = response::error(403, "Admin access required");
        res.prepare_payload();
        return res;
    }

    auto it = params.path.find("id");
    if (it == params.path.end()) {
        http::response<http::string_body> res{http::status::bad_request, req.version()};
        res.body() = response::error(400, "Missing user id");
        res.prepare_payload();
        return res;
    }

    int64_t target_id = sanitize::safe_stoll(it->second);

    // @cuiruoni+管理员不能删除自己，防止误操作
    if (target_id == admin_id) {
        http::response<http::string_body> res{http::status::bad_request, req.version()};
        res.body() = response::error(400, "Cannot delete yourself");
        res.prepare_payload();
        return res;
    }

    try {
        // @cuiruoni+先检查目标用户是否存在
        if (!user_dao::exists_by_id(target_id)) {
                http::response<http::string_body> res{http::status::not_found, req.version()};
            res.body() = response::error(404, "User not found");
            res.prepare_payload();
            return res;
        }

        // @cuiruoni+B13：级联删库不会删磁盘文件，先取投稿文件名，删库成功后再清文件
        std::vector<std::string> video_files = video_dao::list_filenames_by_uploader(target_id);

        // @cuiruoni+B1 残留（图片侧同一件事）：封面、正文里嵌的图、头像也只在数据库里，
        // @cuiruoni+删库不会带走文件，而 /api/upload/file/:name 是公开的 ——
        // @cuiruoni+人删了图还在，等于把他的私有图片永久挂在公网可取的位置。
        // @cuiruoni+这里先把文本取全，删库成功后交给 reclaim_images 逐张判「还有谁在用」。
        std::vector<std::string> media_texts = post_dao::list_media_texts(0, target_id);
        {
            json::object profile = user_dao::find_profile_by_id(target_id);
            auto avatar_it = profile.find("avatar");
            if (avatar_it != profile.end() && avatar_it->value().is_string()) {
                media_texts.push_back(std::string(avatar_it->value().as_string()));
            }
        }

        // @cuiruoni+删除用户；若库中外键确实级联，会连带删除其文章，搜索缓存需同步失效。
        // @cuiruoni+删除失败必须返回 500 —— 原实现忽略 DAO 返回值，外键不级联时会“假成功”。
        if (!user_dao::delete_by_id(target_id)) {
            http::response<http::string_body> res{http::status::internal_server_error, req.version()};
            res.body() = response::error(500, "Failed to delete user");
            res.prepare_payload();
            return res;
        }
        // @cuiruoni+库已经删干净了才动磁盘：此时其它文章/头像若还在引用同一张图，
        // @cuiruoni+引用计数仍 > 0，reclaim 会自动跳过
        post_service::reclaim_images(media_texts);
        std::error_code file_ec;
        for (const auto& name : video_files) {
            std::filesystem::remove(storage::videos() + "/" + name, file_ec);
            if (file_ec) {
                spdlog::warn("Failed to remove video file {}: {}", name, file_ec.message());
                file_ec.clear();
            }
        }
        search_service::invalidate_cache();
        http::response<http::string_body> res{http::status::ok, req.version()};
        res.body() = response::success(std::string("User deleted"));
        res.prepare_payload();
        return res;
    } catch (const std::exception& e) {
        spdlog::error("Admin delete user error: {}", e.what());
        http::response<http::string_body> res{http::status::internal_server_error, req.version()};
        res.body() = response::error(500, "Internal server error");
        res.prepare_payload();
        return res;
    }
}

// @cuiruoni+管理员查看所有文章列表（含作者信息），支持分页和状态过滤
static http::response<http::string_body> handle_admin_list_posts(
    const http::request<http::string_body>& req, const RouteParams& params) {
    int64_t admin_id = 0;
    std::string username, role;
    if (!auth_service::extract_admin_from_token(req, admin_id, username, role)) {
        http::response<http::string_body> res{http::status::forbidden, req.version()};
        res.body() = response::error(403, "Admin access required");
        res.prepare_payload();
        return res;
    }

    int page = 1, page_size = 10;
    std::string status = "all";
    // @cuiruoni+从查询参数中提取分页和状态过滤条件
    auto it = params.query.find("page");
    if (it != params.query.end() && !it->second.empty()) page = sanitize::safe_stoi(it->second);
    it = params.query.find("page_size");
    if (it != params.query.end() && !it->second.empty()) page_size = sanitize::safe_stoi(it->second);
    page = sanitize::clamp_page(page);
    page_size = sanitize::clamp_page_size(page_size, 10);
    it = params.query.find("status");
    if (it != params.query.end()) {
        const auto& s = it->second;
        if (s == "all" || s == "draft" || s == "published") {
            status = s;
        }
    }

    try {
        int total = 0;
        // @cuiruoni+B6/B7：服务端搜索 + 白名单排序
        json::array arr = post_dao::admin_list_posts(page, page_size, status, total,
            query_text(params, "q"), query_sort(params), query_order(params));

        json::object data;
        data["posts"] = std::move(arr);
        data["total"] = total;
        data["page"] = page;
        data["page_size"] = page_size;

        http::response<http::string_body> res{http::status::ok, req.version()};
        res.body() = response::success(data);
        res.prepare_payload();
        return res;
    } catch (const std::exception& e) {
        spdlog::error("Admin list posts error: {}", e.what());
        http::response<http::string_body> res{http::status::internal_server_error, req.version()};
        res.body() = response::error(500, "Internal server error");
        res.prepare_payload();
        return res;
    }
}

// @cuiruoni+管理员删除任意文章，不受所有权限制
static http::response<http::string_body> handle_admin_delete_post(
    const http::request<http::string_body>& req, const RouteParams& params) {
    int64_t admin_id = 0;
    std::string username, role;
    if (!auth_service::extract_admin_from_token(req, admin_id, username, role)) {
        http::response<http::string_body> res{http::status::forbidden, req.version()};
        res.body() = response::error(403, "Admin access required");
        res.prepare_payload();
        return res;
    }

    auto it = params.path.find("id");
    if (it == params.path.end()) {
        http::response<http::string_body> res{http::status::bad_request, req.version()};
        res.body() = response::error(400, "Missing post id");
        res.prepare_payload();
        return res;
    }

    int64_t post_id = sanitize::safe_stoll(it->second);

    try {
        // @cuiruoni+先检查文章是否存在
        if (!post_dao::exists_by_id(post_id)) {
                http::response<http::string_body> res{http::status::not_found, req.version()};
            res.body() = response::error(404, "Post not found");
            res.prepare_payload();
            return res;
        }

        // @cuiruoni+管理员可直接删除任意文章；走 service 以保证搜索缓存同步失效
        if (!post_service::delete_post(post_id)) {
            http::response<http::string_body> res{http::status::internal_server_error, req.version()};
            res.body() = response::error(500, "Failed to delete post");
            res.prepare_payload();
            return res;
        }
            http::response<http::string_body> res{http::status::ok, req.version()};
        res.body() = response::success(std::string("Post deleted"));
        res.prepare_payload();
        return res;
    } catch (const std::exception& e) {
        spdlog::error("Admin delete post error: {}", e.what());
        http::response<http::string_body> res{http::status::internal_server_error, req.version()};
        res.body() = response::error(500, "Internal server error");
        res.prepare_payload();
        return res;
    }
}

// @cuiruoni+管理员查看所有评论列表，支持分页，返回评论及所属文章信息
static http::response<http::string_body> handle_admin_list_comments(
    const http::request<http::string_body>& req, const RouteParams& params) {
    int64_t admin_id = 0;
    std::string username, role;
    if (!auth_service::extract_admin_from_token(req, admin_id, username, role)) {
        http::response<http::string_body> res{http::status::forbidden, req.version()};
        res.body() = response::error(403, "Admin access required");
        res.prepare_payload();
        return res;
    }

    int page = 1, page_size = 10;
    // @cuiruoni+从查询参数中提取分页条件
    auto it = params.query.find("page");
    if (it != params.query.end() && !it->second.empty()) page = sanitize::safe_stoi(it->second);
    it = params.query.find("page_size");
    if (it != params.query.end() && !it->second.empty()) page_size = sanitize::safe_stoi(it->second);
    page = sanitize::clamp_page(page);
    page_size = sanitize::clamp_page_size(page_size, 10);

    try {
        int total = 0;
        // @cuiruoni+B6/B7：服务端搜索（内容/作者/文章标题）+ 白名单排序
        json::array arr = comment_dao::admin_list_comments(page, page_size, total,
            query_text(params, "q"), query_sort(params), query_order(params));

        json::object data;
        data["comments"] = std::move(arr);
        data["total"] = total;
        data["page"] = page;
        data["page_size"] = page_size;

        http::response<http::string_body> res{http::status::ok, req.version()};
        res.body() = response::success(data);
        res.prepare_payload();
        return res;
    } catch (const std::exception& e) {
        spdlog::error("Admin list comments error: {}", e.what());
        http::response<http::string_body> res{http::status::internal_server_error, req.version()};
        res.body() = response::error(500, "Internal server error");
        res.prepare_payload();
        return res;
    }
}

// @cuiruoni+管理员删除任意评论
static http::response<http::string_body> handle_admin_delete_comment(
    const http::request<http::string_body>& req, const RouteParams& params) {
    int64_t admin_id = 0;
    std::string username, role;
    if (!auth_service::extract_admin_from_token(req, admin_id, username, role)) {
        http::response<http::string_body> res{http::status::forbidden, req.version()};
        res.body() = response::error(403, "Admin access required");
        res.prepare_payload();
        return res;
    }

    auto it = params.path.find("id");
    if (it == params.path.end()) {
        http::response<http::string_body> res{http::status::bad_request, req.version()};
        res.body() = response::error(400, "Missing comment id");
        res.prepare_payload();
        return res;
    }

    int64_t comment_id = sanitize::safe_stoll(it->second);

    try {
        // @cuiruoni+先检查评论是否存在
        if (!comment_dao::exists_by_id(comment_id)) {
                http::response<http::string_body> res{http::status::not_found, req.version()};
            res.body() = response::error(404, "Comment not found");
            res.prepare_payload();
            return res;
        }

        comment_dao::delete_by_id(comment_id);
            http::response<http::string_body> res{http::status::ok, req.version()};
        res.body() = response::success(std::string("Comment deleted"));
        res.prepare_payload();
        return res;
    } catch (const std::exception& e) {
        spdlog::error("Admin delete comment error: {}", e.what());
        http::response<http::string_body> res{http::status::internal_server_error, req.version()};
        res.body() = response::error(500, "Internal server error");
        res.prepare_payload();
        return res;
    }
}

// @cuiruoni+管理员查看用户反馈留言（场景 4 联系表单落库的数据），支持分页
static http::response<http::string_body> handle_admin_list_contacts(
    const http::request<http::string_body>& req, const RouteParams& params) {
    int64_t admin_id = 0;
    std::string username, role;
    if (!auth_service::extract_admin_from_token(req, admin_id, username, role)) {
        http::response<http::string_body> res{http::status::forbidden, req.version()};
        res.body() = response::error(403, "Admin access required");
        res.prepare_payload();
        return res;
    }

    int page = 1, page_size = 10;
    auto it = params.query.find("page");
    if (it != params.query.end() && !it->second.empty()) page = sanitize::safe_stoi(it->second);
    it = params.query.find("page_size");
    if (it != params.query.end() && !it->second.empty()) page_size = sanitize::safe_stoi(it->second);
    page = sanitize::clamp_page(page);
    page_size = sanitize::clamp_page_size(page_size, 10);

    try {
        int total = 0;
        // @cuiruoni+B6/B7：服务端搜索（姓名/邮箱/内容）+ 白名单排序
        json::array arr = contact_dao::list(page, page_size, total,
            query_text(params, "q"), query_sort(params), query_order(params));

        json::object data;
        data["contacts"] = std::move(arr);
        data["total"] = total;
        data["page"] = page;
        data["page_size"] = page_size;

        http::response<http::string_body> res{http::status::ok, req.version()};
        res.body() = response::success(data);
        res.prepare_payload();
        return res;
    } catch (const std::exception& e) {
        spdlog::error("Admin list contacts error: {}", e.what());
        http::response<http::string_body> res{http::status::internal_server_error, req.version()};
        res.body() = response::error(500, "Internal server error");
        res.prepare_payload();
        return res;
    }
}

// @cuiruoni+管理员删除留言
static http::response<http::string_body> handle_admin_delete_contact(
    const http::request<http::string_body>& req, const RouteParams& params) {
    int64_t admin_id = 0;
    std::string username, role;
    if (!auth_service::extract_admin_from_token(req, admin_id, username, role)) {
        http::response<http::string_body> res{http::status::forbidden, req.version()};
        res.body() = response::error(403, "Admin access required");
        res.prepare_payload();
        return res;
    }

    auto it = params.path.find("id");
    if (it == params.path.end()) {
        http::response<http::string_body> res{http::status::bad_request, req.version()};
        res.body() = response::error(400, "Missing contact id");
        res.prepare_payload();
        return res;
    }

    int64_t contact_id = sanitize::safe_stoll(it->second);

    try {
        if (!contact_dao::exists_by_id(contact_id)) {
            http::response<http::string_body> res{http::status::not_found, req.version()};
            res.body() = response::error(404, "Contact message not found");
            res.prepare_payload();
            return res;
        }

        contact_dao::delete_by_id(contact_id);
        http::response<http::string_body> res{http::status::ok, req.version()};
        res.body() = response::success(std::string("Contact message deleted"));
        res.prepare_payload();
        return res;
    } catch (const std::exception& e) {
        spdlog::error("Admin delete contact error: {}", e.what());
        http::response<http::string_body> res{http::status::internal_server_error, req.version()};
        res.body() = response::error(500, "Internal server error");
        res.prepare_payload();
        return res;
    }
}

// @cuiruoni+注册管理员API路由，所有路由在handler内部通过extract_admin_from_token检查权限
void register_admin_routes(Router& router) {
    router.add_route("GET", "/api/admin/stats", handle_admin_stats);
    router.add_route("GET", "/api/admin/stats/trend", handle_admin_stats_trend);
    router.add_route("GET", "/api/admin/users", handle_admin_list_users);
    router.add_route("PUT", "/api/admin/users/:id/role", handle_admin_change_user_role);
    router.add_route("DELETE", "/api/admin/users/:id", handle_admin_delete_user);
    router.add_route("GET", "/api/admin/posts", handle_admin_list_posts);
    router.add_route("DELETE", "/api/admin/posts/:id", handle_admin_delete_post);
    router.add_route("GET", "/api/admin/comments", handle_admin_list_comments);
    router.add_route("DELETE", "/api/admin/comments/:id", handle_admin_delete_comment);
    router.add_route("GET", "/api/admin/contacts", handle_admin_list_contacts);
    router.add_route("DELETE", "/api/admin/contacts/:id", handle_admin_delete_contact);
}
