#include "controllers/contact_controller.h"

#include "dao/contact_dao.h"
#include "utils/logger.h"
#include "utils/response.h"
#include "utils/sanitize.h"

#include <boost/json.hpp>
#include <regex>

namespace json = boost::json;
namespace http = boost::beast::http;

// @cuiruoni+处理联系表单提交：验证字段→存入数据库→返回成功响应
static http::response<http::string_body> handle_contact(
    const http::request<http::string_body>& req, const RouteParams& params) {
    try {
        auto body = json::parse(req.body()).as_object();

        // @cuiruoni+提取并清洗字段
        std::string name = sanitize::clean_text(
            std::string(body["name"].as_string()));
        std::string email = sanitize::clean_text(
            std::string(body["email"].as_string()));
        std::string message = sanitize::clean_text(
            std::string(body["message"].as_string()));

        // @cuiruoni+字段验证：name>=2字符，email合法，message>=10字符
        if (name.size() < 2) {
            http::response<http::string_body> res{http::status::bad_request, req.version()};
            res.body() = response::error(400, "Name must be at least 2 characters");
            res.prepare_payload();
            return res;
        }

        std::regex email_regex(R"(^[^\s@]+@[^\s@]+\.[^\s@]+$)");
        if (!std::regex_match(email, email_regex)) {
            http::response<http::string_body> res{http::status::bad_request, req.version()};
            res.body() = response::error(400, "Invalid email address");
            res.prepare_payload();
            return res;
        }

        if (message.size() < 10) {
            http::response<http::string_body> res{http::status::bad_request, req.version()};
            res.body() = response::error(400, "Message must be at least 10 characters");
            res.prepare_payload();
            return res;
        }

        // @cuiruoni+截断字段防止超长输入
        name = sanitize::truncate(name, 100);
        email = sanitize::truncate(email, 100);

        // @cuiruoni+插入联系消息到contact_messages表
        contact_dao::insert(name, email, message);

        http::response<http::string_body> res{http::status::ok, req.version()};
        res.body() = response::success(std::string("Message sent successfully"));
        res.prepare_payload();
        return res;
    } catch (const std::exception& e) {
        spdlog::error("Contact form error: {}", e.what());
        http::response<http::string_body> res{http::status::bad_request, req.version()};
        res.body() = response::error(400, "Invalid request body");
        res.prepare_payload();
        return res;
    }
}

void register_contact_routes(Router& router) {
    router.add_route("POST", "/api/contact", handle_contact);
}
