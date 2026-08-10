#include "utils/dashscope_client.h"

#include "utils/http_client.h"
#include "utils/logger.h"

#include <boost/json.hpp>

#include <map>

namespace json = boost::json;

namespace dashscope {

namespace {
// @cuiruoni+DashScope 异步图像生成端点（wan2.x 系列）
constexpr const char* kSubmitUrl =
    "https://dashscope.aliyuncs.com/api/v1/services/aigc/image-generation/generation";
// @cuiruoni+任务查询端点
constexpr const char* kTaskUrlPrefix = "https://dashscope.aliyuncs.com/api/v1/tasks/";
} // namespace

SubmitResult submit_image_edit(const std::string& api_key, const std::string& model,
                               const std::string& image_mime, const std::string& image_base64,
                               const std::string& prompt) {
    SubmitResult result;
    if (api_key.empty() || model.empty() || image_base64.empty()) {
        result.error = "missing api_key / model / image";
        return result;
    }

    // @cuiruoni+参考图以 data URL 形式内联传输，无需上传 OSS
    std::string data_url = "data:" + image_mime + ";base64," + image_base64;

    json::object content;
    content["image"] = data_url;
    content["text"] = prompt;

    json::array messages_content;
    messages_content.push_back(json::value(std::move(content)));

    json::object user_msg;
    user_msg["role"] = "user";
    user_msg["content"] = json::value(std::move(messages_content));

    json::array messages;
    messages.push_back(json::value(std::move(user_msg)));

    json::object input;
    input["messages"] = json::value(std::move(messages));

    json::object req_body;
    req_body["model"] = model;
    req_body["input"] = json::value(std::move(input));

    std::map<std::string, std::string> headers;
    headers["Authorization"] = "Bearer " + api_key;
    headers["Content-Type"] = "application/json";
    headers["X-DashScope-Async"] = "enable";

    spdlog::info("[dashscope] submit image edit, model={}, image_b64_len={}, prompt_len={}",
                 model, image_base64.size(), prompt.size());

    auto resp = http_client::post_json(kSubmitUrl, json::serialize(json::value(std::move(req_body))),
                                       headers, 90);

    if (resp.status != 200) {
        result.error = "submit failed, http " + std::to_string(resp.status) + ": " + resp.body;
        spdlog::error("[dashscope] {}", result.error);
        return result;
    }

    try {
        json::value v = json::parse(resp.body);
        const auto& obj = v.as_object();
        if (obj.contains("output") && obj.at("output").is_object()) {
            const auto& output = obj.at("output").as_object();
            if (output.contains("task_id")) {
                result.task_id = std::string(output.at("task_id").as_string());
                result.ok = true;
            } else {
                result.error = "no task_id in response: " + resp.body;
            }
        } else {
            result.error = "unexpected response: " + resp.body;
        }
    } catch (const std::exception& e) {
        result.error = std::string("parse response failed: ") + e.what();
    }
    return result;
}

QueryResult query_task(const std::string& api_key, const std::string& task_id) {
    QueryResult result;
    std::map<std::string, std::string> headers;
    headers["Authorization"] = "Bearer " + api_key;

    auto resp = http_client::get(kTaskUrlPrefix + task_id, headers, 30);
    if (resp.status != 200) {
        result.status = "";
        result.error = "query failed, http " + std::to_string(resp.status) + ": " + resp.body;
        return result;
    }

    try {
        json::value v = json::parse(resp.body);
        const auto& obj = v.as_object();
        if (!obj.contains("output") || !obj.at("output").is_object()) {
            result.status = "";
            result.error = "unexpected response: " + resp.body;
            return result;
        }
        const auto& output = obj.at("output").as_object();

        auto get_str = [&output](const char* key, const std::string& def = "") -> std::string {
            auto it = output.find(key);
            if (it != output.end() && it->value().is_string()) {
                return std::string(it->value().as_string());
            }
            return def;
        };

        result.status = get_str("task_status");
        result.error = get_str("message");

        if (result.status == "SUCCEEDED" && output.contains("results")) {
            const auto& results = output.at("results");
            if (results.is_array() && !results.as_array().empty()) {
                const auto& first = results.as_array().front();
                if (first.is_object()) {
                    auto it = first.as_object().find("url");
                    if (it != first.as_object().end() && it->value().is_string()) {
                        result.image_url = std::string(it->value().as_string());
                    }
                }
            }
        }
    } catch (const std::exception& e) {
        result.status = "";
        result.error = std::string("parse response failed: ") + e.what();
    }
    return result;
}

}
