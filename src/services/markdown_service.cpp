#include "services/markdown_service.h"

#include <cmark.h>

namespace markdown_service {

std::string render(const std::string& md) {
    char* html = cmark_markdown_to_html(md.c_str(), md.size(), CMARK_OPT_DEFAULT);
    std::string result(html);
    free(html);
    return result;
}

}
