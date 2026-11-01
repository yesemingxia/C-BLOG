#include "middleware/cors_middleware.h"
#include "utils/config.h"

namespace cors_middleware {

// @cuiruoni+CORS中间件：为所有响应添加跨域访问头，允许前端跨域调用API
// @cuiruoni+B14：具体逻辑在头文件的模板里，文件响应也能复用
void cors_handle_request(const http::request<http::string_body>& req,
                         http::response<http::string_body>& res) {
    apply_cors(req, res);
}

}
