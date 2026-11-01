#include "controllers/notification_controller.h"

#include "dao/notification_dao.h"
#include "services/auth_service.h"
#include "utils/logger.h"
#include "utils/response.h"
#include "utils/sanitize.h"

#include <boost/json.hpp>

namespace json = boost::json;
namespace http = boost::beast::http;

// @cuiruoni+获取当前用户的通知列表，按创建时间倒序排列
static http::response<http::string_body> handle_list_notifications(
    const http::request<http::string_body>& req, const RouteParams& params) {
    int64_t user_id = 0;
    std::string username, role;
    if (!auth_service::extract_user_from_token(req, user_id, username, role)) {
        http::response<http::string_body> res{http::status::unauthorized, req.version()};
        res.body() = response::error(401, "Authentication required");
        res.prepare_payload();
        return res;
    }

    try {
        // @cuiruoni+B12：分页 + 跨页未读总数（角标不能只数当前页）
        int page = 1, page_size = 20;
        auto page_it = params.query.find("page");
        if (page_it != params.query.end() && !page_it->second.empty()) {
            page = sanitize::safe_stoi(page_it->second, 1);
        }
        auto size_it = params.query.find("page_size");
        if (size_it != params.query.end() && !size_it->second.empty()) {
            page_size = sanitize::safe_stoi(size_it->second, 20);
        }
        page = sanitize::clamp_page(page);
        page_size = sanitize::clamp_page_size(page_size, 20);

        int total = 0;
        json::array arr = notification_dao::list_by_user_id(user_id, page, page_size, total);

        json::object data;
        data["notifications"] = std::move(arr);
        data["total"] = total;
        data["page"] = page;
        data["page_size"] = page_size;
        data["unread_count"] = notification_dao::count_unread(user_id);

        http::response<http::string_body> res{http::status::ok, req.version()};
        res.body() = response::success(json::value(std::move(data)));
        res.prepare_payload();
        return res;
    } catch (const std::exception& e) {
        spdlog::error("List notifications error: {}", e.what());
        http::response<http::string_body> res{http::status::internal_server_error, req.version()};
        res.body() = response::error(500, "Internal server error");
        res.prepare_payload();
        return res;
    }
}

// @cuiruoni+标记单条通知为已读，需验证通知属于当前用户
static http::response<http::string_body> handle_mark_read(
    const http::request<http::string_body>& req, const RouteParams& params) {
    int64_t user_id = 0;
    std::string username, role;
    if (!auth_service::extract_user_from_token(req, user_id, username, role)) {
        http::response<http::string_body> res{http::status::unauthorized, req.version()};
        res.body() = response::error(401, "Authentication required");
        res.prepare_payload();
        return res;
    }

    auto it = params.path.find("id");
    if (it == params.path.end()) {
        http::response<http::string_body> res{http::status::bad_request, req.version()};
        res.body() = response::error(400, "Missing notification id");
        res.prepare_payload();
        return res;
    }

    int64_t notif_id = sanitize::safe_stoll(it->second);

    try {
        if (!notification_dao::mark_read(notif_id, user_id)) {
            http::response<http::string_body> res{http::status::not_found, req.version()};
            res.body() = response::error(404, "Notification not found");
            res.prepare_payload();
            return res;
        }

        http::response<http::string_body> res{http::status::ok, req.version()};
        res.body() = response::success(std::string("Notification marked as read"));
        res.prepare_payload();
        return res;
    } catch (const std::exception& e) {
        spdlog::error("Mark notification read error: {}", e.what());
        http::response<http::string_body> res{http::status::internal_server_error, req.version()};
        res.body() = response::error(500, "Internal server error");
        res.prepare_payload();
        return res;
    }
}

// @cuiruoni+标记当前用户所有通知为已读
static http::response<http::string_body> handle_mark_all_read(
    const http::request<http::string_body>& req, const RouteParams& params) {
    int64_t user_id = 0;
    std::string username, role;
    if (!auth_service::extract_user_from_token(req, user_id, username, role)) {
        http::response<http::string_body> res{http::status::unauthorized, req.version()};
        res.body() = response::error(401, "Authentication required");
        res.prepare_payload();
        return res;
    }

    try {
        notification_dao::mark_all_read(user_id);

        http::response<http::string_body> res{http::status::ok, req.version()};
        res.body() = response::success(std::string("All notifications marked as read"));
        res.prepare_payload();
        return res;
    } catch (const std::exception& e) {
        spdlog::error("Mark all notifications read error: {}", e.what());
        http::response<http::string_body> res{http::status::internal_server_error, req.version()};
        res.body() = response::error(500, "Internal server error");
        res.prepare_payload();
        return res;
    }
}

// @cuiruoni+删除单条通知，需验证通知属于当前用户
static http::response<http::string_body> handle_delete_notification(
    const http::request<http::string_body>& req, const RouteParams& params) {
    int64_t user_id = 0;
    std::string username, role;
    if (!auth_service::extract_user_from_token(req, user_id, username, role)) {
        http::response<http::string_body> res{http::status::unauthorized, req.version()};
        res.body() = response::error(401, "Authentication required");
        res.prepare_payload();
        return res;
    }

    auto it = params.path.find("id");
    if (it == params.path.end()) {
        http::response<http::string_body> res{http::status::bad_request, req.version()};
        res.body() = response::error(400, "Missing notification id");
        res.prepare_payload();
        return res;
    }

    int64_t notif_id = sanitize::safe_stoll(it->second);

    try {
        if (!notification_dao::delete_by_id(notif_id, user_id)) {
            http::response<http::string_body> res{http::status::not_found, req.version()};
            res.body() = response::error(404, "Notification not found");
            res.prepare_payload();
            return res;
        }

        http::response<http::string_body> res{http::status::ok, req.version()};
        res.body() = response::success(std::string("Notification deleted"));
        res.prepare_payload();
        return res;
    } catch (const std::exception& e) {
        spdlog::error("Delete notification error: {}", e.what());
        http::response<http::string_body> res{http::status::internal_server_error, req.version()};
        res.body() = response::error(500, "Internal server error");
        res.prepare_payload();
        return res;
    }
}

void register_notification_routes(Router& router) {
    router.add_route("GET", "/api/notifications", handle_list_notifications);
    router.add_route("PUT", "/api/notifications/:id/read", handle_mark_read);
    router.add_route("PUT", "/api/notifications/read-all", handle_mark_all_read);
    router.add_route("DELETE", "/api/notifications/:id", handle_delete_notification);
}
