// @cuiruoni+单元测试：不依赖MySQL/Redis，验证纯逻辑工具（P1修复）
#include "dao/dao_utils.h"
#include "services/post_service.h"
#include "utils/client_ip.h"
#include "utils/http_range.h"
#include "utils/mentions.h"
#include "utils/sanitize.h"
#include "utils/password.h"
#include "utils/response.h"
#include "utils/storage.h"

#include <boost/json.hpp>
#include <chrono>
#include <filesystem>
#include <fstream>
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

    // @cuiruoni+A2：文章可见性矩阵（匿名 / 登录 / 作者 / 管理员）
    {
        Post post;
        post.id = 1;
        post.user_id = 10;
        post.status = "published";
        post.visibility = "public";
        CHECK(post_service::can_view_post(post, 0, ""));
        CHECK(post_service::can_view_post(post, 20, "user"));

        post.visibility = "members";
        CHECK(!post_service::can_view_post(post, 0, ""));
        CHECK(post_service::can_view_post(post, 20, "user"));

        post.visibility = "private";
        CHECK(!post_service::can_view_post(post, 0, ""));
        CHECK(!post_service::can_view_post(post, 20, "user"));
        CHECK(post_service::can_view_post(post, 10, "user"));
        CHECK(post_service::can_view_post(post, 99, "admin"));

        post.status = "draft";
        post.visibility = "public";
        CHECK(!post_service::can_view_post(post, 0, ""));
        CHECK(!post_service::can_view_post(post, 20, "user"));
        CHECK(post_service::can_view_post(post, 10, "user"));
        CHECK(post_service::can_view_post(post, 99, "admin"));

        post.status = "published";
        post.visibility = "unknown";
        CHECK(!post_service::can_view_post(post, 20, "user"));

        Post missing;
        CHECK(!post_service::can_view_post(missing, 0, "admin"));
    }

    // @cuiruoni+B4：分页夹紧
    CHECK(sanitize::clamp_page(-3) == 1);
    CHECK(sanitize::clamp_page(0) == 1);
    CHECK(sanitize::clamp_page(2) == 2);
    CHECK(sanitize::clamp_page_size(0, 10) == 10);
    CHECK(sanitize::clamp_page_size(-1, 20) == 20);
    CHECK(sanitize::clamp_page_size(50) == 50);
    CHECK(sanitize::clamp_page_size(101) == 100);
    // @cuiruoni+B4 的上半边：原先只夹下界，?page=2147483647&page_size=100 会在
    // @cuiruoni+int offset = (page - 1) * page_size 里溢出成负数，绕回「负 OFFSET → MySQL 报错 → 500」，
    // @cuiruoni+也就是 B4 本来要堵死的那条路。下面三条钉住夹紧后的组合算不出负/越界 offset。
    CHECK(sanitize::clamp_page(2147483647) == 100000);
    CHECK(sanitize::clamp_page(1000000000) == 100000);
    {
        int offset = (sanitize::clamp_page(2147483647) - 1) * sanitize::clamp_page_size(100, 10);
        CHECK(offset > 0);
    }
    CHECK(sanitize::clamp_int(0, 1, 24) == 1);
    CHECK(sanitize::clamp_int(99, 1, 24) == 24);

    // @cuiruoni+B6：LIKE 通配符转义
    CHECK(sanitize::escape_like("100%_ok") == "100\\%\\_ok");
    CHECK(sanitize::escape_like("a\\b") == "a\\\\b");

    // @cuiruoni+B10：Range 解析矩阵
    {
        using http_range::parse;
        auto r = parse("bytes=0-99", 1000);
        CHECK(r.present && r.satisfiable && r.start == 0 && r.end == 99);
        r = parse("bytes=100-", 1000);
        CHECK(r.present && r.satisfiable && r.start == 100 && r.end == 999);
        r = parse("bytes=-100", 1000);
        CHECK(r.present && r.satisfiable && r.start == 900 && r.end == 999);
        r = parse("bytes=-2000", 1000);
        CHECK(r.present && r.satisfiable && r.start == 0 && r.end == 999);
        r = parse("bytes=900-2000", 1000);
        CHECK(r.present && r.satisfiable && r.start == 900 && r.end == 999);
        r = parse("bytes=1000-", 1000);
        CHECK(r.present && !r.satisfiable);
        r = parse("bytes=50-10", 1000);
        CHECK(r.present && !r.satisfiable);
        r = parse("bytes=0-1,3-4", 1000);
        CHECK(!r.present);
        r = parse("items=0-1", 1000);
        CHECK(!r.present);
        r = parse("bytes=0-", 0);
        CHECK(r.present && !r.satisfiable);
        r = parse("bytes=abc-def", 1000);
        CHECK(!r.present);
    }

    // @cuiruoni+B12：@mention 提取
    {
        auto m = mentions::extract("你好 @alice 和 @bob，谢谢");
        CHECK(m.size() == 2);
        CHECK(m[0] == "alice");
        CHECK(m[1] == "bob");

        m = mentions::extract("mail me at a@b.com");
        CHECK(m.empty());

        m = mentions::extract("@alice @alice @ALICE");
        CHECK(m.size() == 2); // 大小写敏感，alice 只出现一次

        m = mentions::extract("@a @b @c @d @e @f @g");
        CHECK(m.size() == 5); // 最多 5 个

        m = mentions::extract("中文@张三，收到");
        CHECK(m.size() == 1 && m[0] == "张三");
    }

    // @cuiruoni+安全：客户端 IP 由服务端单点裁定，X-Real-IP / X-Client-IP 默认不认账
    {
        using client_ip::resolve;
        // @cuiruoni+默认（直连后端）：头里伪造什么都不管用，只认 TCP 对端
        CHECK(resolve("8.8.8.8", "127.0.0.1", false) == "127.0.0.1");
        CHECK(resolve("", "127.0.0.1", false) == "127.0.0.1");
        // @cuiruoni+确认在可信代理之后才按代理写的 X-Real-IP 分桶
        CHECK(resolve("203.0.113.9", "10.0.0.5", true) == "203.0.113.9");
        // @cuiruoni+代理模式但请求没带该头：仍回落到对端地址
        CHECK(resolve("", "10.0.0.5", true) == "10.0.0.5");
        // @cuiruoni+连对端都取不到：统一 "unknown"，不允许退化成「按头里的任意值开新桶」
        CHECK(resolve("", "", false) == "unknown");
        CHECK(resolve("1.2.3.4", "", false) == "unknown");
    }

    // @cuiruoni+落盘根目录：相对 storage_root 按「配置文件所属项目根」解析，与进程工作目录无关
    {
        namespace fs = std::filesystem;
        auto same = [](const std::string& actual, const char* expected) {
            return fs::path(actual) == fs::path(expected);
        };
        // @cuiruoni+start.bat 传绝对配置路径、却把 cwd 切到 build/Release：文件仍应落回仓库根
        CHECK(same(storage::derive_root("D:/repo/config/config.json", "uploads", "D:/repo/build/Release"),
                   "D:/repo/uploads"));
        // @cuiruoni+从仓库根用相对路径启动（README 的方式）：结果同一个
        CHECK(same(storage::derive_root("config/config.json", "uploads", "D:/repo"), "D:/repo/uploads"));
        // @cuiruoni+配置写绝对路径 → 原样采用（媒体盘挂别处的场景）
        CHECK(same(storage::derive_root("D:/repo/config/config.json", "E:/media", "D:/repo"), "E:/media"));
        // @cuiruoni+配置只有一个文件名（没有目录段）→ 项目根按 cwd，不能退到盘根
        CHECK(same(storage::derive_root("blog.json", "uploads", "D:/srv"), "D:/srv/uploads"));
        // @cuiruoni+storage_root 缺省 → "uploads"
        CHECK(same(storage::derive_root("D:/repo/config/config.json", "", "D:/repo"), "D:/repo/uploads"));
    }

    // @cuiruoni+B1 残留（图片回收）：文件名解析 + 「删不到 images 目录外面去」
    {
        namespace fs = std::filesystem;
        auto names = storage::extract_image_names(
            "![封面](/api/upload/file/1730_a.png) 正文里还有 /api/upload/file/1730_b.jpg");
        CHECK(names.size() == 2);
        CHECK(names.size() == 2 && names[0] == "1730_a.png" && names[1] == "1730_b.jpg");
        // @cuiruoni+同一张图重复出现只记一次，避免对同一个文件删两遍
        CHECK(storage::extract_image_names("/api/upload/file/x.png /api/upload/file/x.png").size() == 1);
        // @cuiruoni+marker 后面是空/非法字符 → 什么都不该取出来
        CHECK(storage::extract_image_names("/api/upload/file/ nope").empty());
        CHECK(storage::extract_image_names("").empty());

        CHECK(storage::is_safe_image_name("1730_a.png"));
        CHECK(!storage::is_safe_image_name(""));
        CHECK(!storage::is_safe_image_name(".."));
        CHECK(!storage::is_safe_image_name("../evil.png"));   // @cuiruoni+路径穿越
        CHECK(!storage::is_safe_image_name("a/b.png"));       // @cuiruoni+带目录分隔符
        CHECK(!storage::is_safe_image_name("a\\b.png"));
        CHECK(!storage::is_safe_image_name(".hidden"));       // @cuiruoni+点开头不是我们生成的资源
        CHECK(!storage::is_safe_image_name("has space.png"));
        CHECK(!storage::is_safe_image_name(std::string(129, 'a') + ".png"));

        // @cuiruoni+把 storage 根指到临时目录，真删一次看效果（测完即删）
        const std::string tag = "blog_storage_ut_" + std::to_string(
            std::chrono::duration_cast<std::chrono::milliseconds>(
                std::chrono::system_clock::now().time_since_epoch()).count());
        const fs::path tmp = fs::temp_directory_path() / tag;
        std::error_code mk_ec;
        fs::create_directories(tmp / "uploads" / "images", mk_ec);
        CHECK(!mk_ec);
        // @cuiruoni+init 只要两个参数，cwd 由它自己取；这里配置路径是绝对临时目录，
        // @cuiruoni+算出来的根与进程 cwd 无关
        storage::init((tmp / "config" / "config.json").string(), "uploads");
        // @cuiruoni+storage::images() 必须正好指到刚建的临时目录（same() 只收 const char*，这里直接比 path）
        CHECK(std::filesystem::path(storage::images()) == tmp / "uploads" / "images");

        { std::ofstream(tmp / "uploads" / "images" / "ok.png") << "x"; }
        { std::ofstream(tmp / "uploads" / "escape.png") << "x"; }
        CHECK(storage::remove_image("ok.png"));                                        // 正常回收
        CHECK(!fs::exists(tmp / "uploads" / "images" / "ok.png"));
        CHECK(!storage::remove_image("../escape.png"));                                // 越界必须拒绝
        CHECK(fs::exists(tmp / "uploads" / "escape.png"));                              // 且文件还在
        CHECK(!storage::remove_image("not-there.png"));                                 // 不存在 → false
        fs::remove_all(tmp, mk_ec);
    }

    // @cuiruoni+B7：排序白名单 —— 非法列回退默认列，方向规整
    {
        std::unordered_map<std::string, std::string> cols = {
            {"id", "p.id"}, {"created_at", "p.created_at"},
        };
        CHECK(dao_utils::build_order_by("id", "asc", cols, "created_at") == " ORDER BY p.id ASC");
        CHECK(dao_utils::build_order_by("id", "DESC", cols, "created_at") == " ORDER BY p.id DESC");
        // @cuiruoni+非主键排序必须自动追加主键兜底：同一秒 created_at 并列的行，MySQL 不保证先后，
        // @cuiruoni+翻页会出现「一条在两张页都出现、另一条哪页都没有」。按主键排序时则不重复追加。
        CHECK(dao_utils::build_order_by("evil; DROP TABLE", "asc", cols, "created_at") ==
              " ORDER BY p.created_at ASC, p.id ASC");
        CHECK(dao_utils::build_order_by("created_at", "desc", cols, "created_at") ==
              " ORDER BY p.created_at DESC, p.id DESC");
    }

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
