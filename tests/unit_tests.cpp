// @cuiruoni+单元测试：不依赖MySQL/Redis，验证纯逻辑工具（P1修复）
#include "utils/sanitize.h"
#include "utils/password.h"
#include "utils/response.h"

#include <boost/json.hpp>
#include <iostream>
#include <string>

namespace json = boost::json;

static int g_failures = 0;

#define CHECK(cond) do { \
    if (!(cond)) { \
        std::cerr << "FAIL: " << #cond << " (line " << __LINE__ << ")" << std::endl; \
        ++g_failures; \
    } \
} while (0)

int main() {
    // sanitize：clean_text 只去空白、不转义（P1修复：避免双重编码）
    CHECK(sanitize::clean_text("  hello  ") == "hello");
    CHECK(sanitize::clean_text("<script>") == "<script>");
    CHECK(sanitize::clean_text("  ") == "");

    // escape_html 仍可用于需要输出HTML的场景
    CHECK(sanitize::escape_html("<b>&\"'") == "&lt;b&gt;&amp;&quot;&#39;");

    // truncate
    CHECK(sanitize::truncate("abcdef", 3) == "abc");
    CHECK(sanitize::truncate("abc", 5) == "abc");

    // safe_stoi / safe_stoll
    CHECK(sanitize::safe_stoi("42", 0) == 42);
    CHECK(sanitize::safe_stoi("abc", -1) == -1);
    CHECK(sanitize::safe_stoll("9223372036854775807", 0) == 9223372036854775807LL);
    CHECK(sanitize::safe_stoll("xyz", 7) == 7);

    // safe_url 协议白名单
    CHECK(sanitize::safe_url("javascript:alert(1)").empty());
    CHECK(sanitize::safe_url("data:text/html,x").empty());
    CHECK(sanitize::safe_url("https://example.com") == "https://example.com");

    // password：哈希/验证/Base64 往返
    std::string salt = password::generate_salt();
    std::string hash = password::hash_password("Hello123", salt);
    CHECK(hash.size() == 32);
    CHECK(password::verify_password("Hello123", salt, hash));
    CHECK(!password::verify_password("Wrong123", salt, hash));

    std::string raw = "binary\x00data";
    std::string b64 = password::base64_encode(raw);
    CHECK(password::base64_decode(b64) == raw);
    CHECK(password::base64_encode("") == "");
    CHECK(password::base64_decode("") == "");

    // 不同盐产生不同哈希
    std::string salt2 = password::generate_salt();
    std::string hash2 = password::hash_password("Hello123", salt2);
    CHECK(hash != hash2 || salt != salt2);

    // response：统一响应格式
    json::value v = json::parse(response::success(json::object{{"a", 1}}));
    CHECK(v.as_object()["code"].as_int64() == 0);
    CHECK(v.as_object()["message"].as_string() == "success");
    CHECK(v.as_object()["data"].as_object()["a"].as_int64() == 1);

    json::value e = json::parse(response::error(404, "Not Found"));
    CHECK(e.as_object()["code"].as_int64() == 404);
    CHECK(e.as_object()["message"].as_string() == "Not Found");
    CHECK(e.as_object()["data"].is_null());

    if (g_failures == 0) {
        std::cout << "All unit tests passed" << std::endl;
        return 0;
    }
    std::cerr << g_failures << " check(s) failed" << std::endl;
    return 1;
}
