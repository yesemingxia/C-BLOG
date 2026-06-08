#include "services/markdown_service.h"

#include <cmark.h>

// @cuiruoni+Markdown渲染服务，使用cmark库将Markdown文本转换为HTML
namespace markdown_service {

// @cuiruoni+调用cmark库渲染Markdown为HTML，使用默认选项，调用方需注意cmark返回的指针需手动释放
std::string render(const std::string& md) {
    char* html = cmark_markdown_to_html(md.c_str(), md.size(), CMARK_OPT_DEFAULT);
    if (!html) return "";
    std::string result(html);
    free(html);
    return result;
}

}
