#pragma once

#include <string>

// @cuiruoni+「谁在调这个接口」的唯一裁决点（纯逻辑，便于单测）。
// @cuiruoni+X-Real-IP 和 X-Client-IP 都是客户端可以自带的请求头，默认不能认账：
// @cuiruoni+一旦认账，调用方每请求换一个值就能给限流桶、浏览量去重键各开一个新的身份，
// @cuiruoni+等于限流不存在（本仓库的回归脚本正是靠这个特性做分桶的，见 BACKEND_P1P2_FIX.md 第 8.5 节）。
// @cuiruoni+只有确认部署在可信反向代理之后才设 trust_proxy_real_ip=true ——
// @cuiruoni+即 Nginx 用 $remote_addr 覆写 X-Real-IP，且后端端口不直接对外暴露。
namespace client_ip {

// @param real_ip_header 请求里的 X-Real-IP，缺省传空串
// @param peer_ip        TCP 对端地址，取不到时传空串
// @return 服务端认定可信的客户端 IP；两者都拿不到时返回 "unknown"
inline std::string resolve(const std::string& real_ip_header, const std::string& peer_ip,
                           bool trust_proxy_real_ip) {
    if (trust_proxy_real_ip && !real_ip_header.empty()) return real_ip_header;
    return peer_ip.empty() ? std::string("unknown") : peer_ip;
}

}
