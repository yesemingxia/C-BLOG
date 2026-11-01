#pragma once

#include <algorithm>
#include <filesystem>
#include <string>
#include <vector>

// @cuiruoni+落盘资源（图片 / 视频 / 上传分片）的根目录。
// @cuiruoni+以前各处直接把 "uploads/xxx" 拼进代码，实际位置由**进程工作目录**决定：
// @cuiruoni+start.bat 是 `cd build\Release && blog.exe` 启动的，文件就落到 build/Release/uploads；
// @cuiruoni+从仓库根启动又落到仓库根 uploads —— 换一种启动方式就看不见上一次传的东西，
// @cuiruoni+表现是「上传成功但 404」。这里在启动时把它算成一个确定的绝对路径。
namespace storage {

// @cuiruoni+纯函数，单测直接覆盖：相对 storage_root 一律相对「配置文件所属项目根」解析，
// @cuiruoni+而不是进程工作目录；配置写成绝对路径时原样采用。
// @param config_path  --config 传进来的路径（可能是相对路径）
// @param configured   配置项 storage_root 的值，空则按 "uploads"
// @param cwd          当前工作目录，注入进来避免单测依赖真实文件系统
inline std::string derive_root(const std::string& config_path, const std::string& configured,
                               const std::string& cwd) {
    namespace fs = std::filesystem;

    const std::string want = configured.empty() ? std::string("uploads") : configured;
    const fs::path given(config_path);

    fs::path project;
    if (given.parent_path().empty()) {
        // @cuiruoni+配置就摆在当前目录：项目根按 cwd 算，不要退到它的上一级（那是盘根）
        project = cwd.empty() ? fs::path(".") : fs::path(cwd);
    } else {
        // @cuiruoni+相对配置路径直接按注入的 cwd 展开 —— 不能用 weakly_canonical，
        // @cuiruoni+它会去查**进程真实工作目录**，这个函数就不再是纯函数、单测也不稳定
        fs::path abs = given;
        if (!abs.is_absolute() && !cwd.empty()) abs = fs::path(cwd) / given;
        fs::path up = abs.parent_path().parent_path(); // @cuiruoni+config/ 再上一级 = 项目根
        project = up.empty() ? (cwd.empty() ? fs::path(".") : fs::path(cwd)) : up;
    }

    fs::path root = fs::path(want);
    if (!root.is_absolute()) root = project / root;
    if (!root.is_absolute() && !cwd.empty()) root = fs::path(cwd) / root;
    return root.lexically_normal().string();
}

inline std::string& root_slot() {
    // @cuiruoni+init() 在线程启动前调用一次，之后只读，不需要加锁
    static std::string value = "uploads";
    return value;
}

inline void init(const std::string& config_path, const std::string& configured_root) {
    namespace fs = std::filesystem;
    std::string cwd;
    std::error_code ec;
    auto current = fs::current_path(ec);
    if (!ec) cwd = current.string();
    root_slot() = derive_root(config_path, configured_root, cwd);
}

inline const std::string& root() { return root_slot(); }
inline std::string images() { return root() + "/images"; }
inline std::string videos() { return root() + "/videos"; }
inline std::string video_tmp() { return root() + "/videos/tmp"; }

// @cuiruoni+B1 残留：删文章/删用户只删了数据库行，图片文件留在磁盘上，
// @cuiruoni+而 /api/upload/file/:name 是鉴权白名单里的公开接口 —— 账号注销了，
// @cuiruoni+他上传的图片还能被任何人取到。下面三个函数配合 DAO 的引用计数做回收。

// @cuiruoni+与 upload_controller::handle_get_file 同一套白名单（≤128、不含 / \ ..，
// @cuiruoni+只允许字母数字和 . - _）。删文件前必须过这一关，否则脏数据能把路径穿越变成删库。
inline bool is_safe_image_name(const std::string& name) {
    if (name.empty() || name.size() > 128) return false;
    if (name.find("..") != std::string::npos) return false;
    if (name.find('/') != std::string::npos || name.find('\\') != std::string::npos) return false;
    if (name.front() == '.') return false;  // @cuiruoni+藏文件（.htaccess 之类）一概不当自己的资源
    for (char c : name) {
        const bool ok = (c >= '0' && c <= '9') || (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')
                        || c == '.' || c == '-' || c == '_';
        if (!ok) return false;
    }
    return true;
}

// @cuiruoni+从任意文本（文章正文、封面字段、头像字段）里取出本站图片文件名，按出现顺序去重。
// @cuiruoni+只认 /api/upload/file/<name> 这一种形态：外部图床 URL、相对路径都不是我们拥有的文件，
// @cuiruoni+不能删。纯函数，可直接单测。
inline std::vector<std::string> extract_image_names(const std::string& text) {
    static const std::string marker = "/api/upload/file/";
    auto is_name_char = [](char c) {
        return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')
               || c == '.' || c == '-' || c == '_';
    };
    std::vector<std::string> names;
    size_t pos = 0;
    while ((pos = text.find(marker, pos)) != std::string::npos) {
        pos += marker.size();
        size_t end = pos;
        while (end < text.size() && is_name_char(text[end])) ++end;
        if (end == pos) continue;  // @cuiruoni+marker 后面紧跟非法字符（比如空文件名）
        std::string name = text.substr(pos, end - pos);
        // @cuiruoni+逐字符放宽过 '.'，截出来的整串仍要复查一次，
        // @cuiruoni+避免「..」这类片段或纯点号的名字被当成合法文件
        if (!is_safe_image_name(name)) continue;
        if (std::find(names.begin(), names.end(), name) == names.end()) names.push_back(name);
    }
    return names;
}

// @cuiruoni+删除 images 目录下的单个文件。调用方必须先确认数据库里已无任何引用，
// @cuiruoni+这里只负责「路径安全 + 不报错炸穿」，不做任何业务判断。
inline bool remove_image(const std::string& name) {
    if (!is_safe_image_name(name)) return false;
    std::error_code ec;
    const bool removed = std::filesystem::remove(images() + "/" + name, ec);
    if (ec) return false;
    return removed;
}

}
