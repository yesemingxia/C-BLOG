#include "services/markdown_service.h"

#include <cmark.h>

// @cuiruoni+Markdown渲染服务，使用cmark库将Markdown文本转换为HTML
namespace markdown_service {

// @cuiruoni+调用cmark库渲染Markdown为HTML，使用CMARK_OPT_SAFE过滤危险HTML标签防止XSS
std::string render(const std::string& md) {
    char* html = cmark_markdown_to_html(md.c_str(), md.size(), CMARK_OPT_SAFE);
    if (!html) return "";
    std::string result(html);
    free(html);
    return result;
}

}
