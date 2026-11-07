#!/usr/bin/env python3
"""第七轮审计修复回归（F1/F2/F3/F6/F11/F15，见 BACKEND_AUDIT_FIX_2026-11-07.md）。

前置：
  - 后端已启动（默认 http://127.0.0.1:8089），必须带 TRUST_PROXY_REAL_IP=true：
        TRUST_PROXY_REAL_IP=true ./build/Release/blog.exe --config config/config.json
  - MySQL 可用。管理员账号由脚本自举：注册 audit_*_adm 后用 config 里的库口令
    UPDATE role='admin'（与 p1p2 文档口径一致），结束后清理；不需要环境变量。
  - Redis 可选：F1 脏缓存用例只在 Redis 可用且本机有 redis-cli 时跑，否则显式 skip。

用法：python tests/audit_fix_check.py
退出码：0=全部通过（skip 不算失败）；1=有断言失败。测试数据在 finally 清理。
"""

import http.client
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from http.cookiejar import CookieJar
from pathlib import Path

BASE = os.environ.get("BLOG_API_BASE", "http://127.0.0.1:8089").rstrip("/")
PARSED = urllib.parse.urlsplit(BASE)
ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT / "config" / "config.json"
VIDEO_DIR = ROOT / "uploads" / "videos"
MYSQL = shutil.which("mysql") or r"C:\Program Files\MySQL\MySQL Server 9.3\bin\mysql.exe"
REDISCLI = shutil.which("redis-cli")

PREFIX = f"audit_{int(time.time())}"
PASSWORD = "Passw0rd9"  # 与既有回归脚本同口径的测试夹具口令，仅用于本脚本注册的临时账号

checks, failures = [], []


def check(name, ok, detail=""):
    checks.append((name, bool(ok)))
    if not ok:
        failures.append(name)
    print(("PASS  " if ok else "FAIL  ") + name + ("" if ok else f"  {detail}"))


def skip(name, reason):
    print(f"skip  {name} —— {reason}")


def mysql_run(sql):
    cfg = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    env = os.environ.copy()
    env["MYSQL_PWD"] = cfg["db_password"]
    # X DevAPI 配置端口(默认 33060)与经典协议端口不同：mysql CLI 固定走 3306
    args = [MYSQL, "-h", "127.0.0.1", "-P", "3306",
            "-u", cfg["db_user"], "-N", "-B", "-e", sql, cfg["db_name"]]
    return subprocess.run(args, env=env, capture_output=True, text=True, timeout=30)


class Client:
    def __init__(self, name, ip):
        self.name = name
        self.ip_prefix = ip.rsplit(".", 1)[0]
        self.ip_host = int(ip.rsplit(".", 1)[1])
        self._seq = 0
        self.jar = CookieJar()
        # 显式清空代理：harness 注入的 HTTP_PROXY 会劫持本地回环请求
        self.opener = urllib.request.build_opener(
            urllib.request.ProxyHandler({}),
            urllib.request.HTTPCookieProcessor(self.jar),
        )

    def request(self, method, path, body=None, headers=None):
        self._seq += 1
        merged = {"X-Real-IP": f"{self.ip_prefix}.{self.ip_host + 8 * (self._seq % 8)}"}
        data = None
        if isinstance(body, (bytes, bytearray)):
            data = bytes(body)
            merged["Content-Type"] = "application/octet-stream"
        elif body is not None:
            data = json.dumps(body).encode("utf-8")
            merged["Content-Type"] = "application/json"
        merged.update(headers or {})
        req = urllib.request.Request(BASE + path, data=data, headers=merged, method=method)
        try:
            with self.opener.open(req, timeout=30) as resp:
                return resp.status, dict(resp.headers), resp.read()
        except urllib.error.HTTPError as exc:
            return exc.code, dict(exc.headers), exc.read()

    def json(self, method, path, body=None, headers=None):
        status, hdrs, payload = self.request(method, path, body, headers)
        try:
            parsed = json.loads(payload.decode("utf-8")) if payload else {}
        except Exception:
            parsed = {}
        return status, parsed, hdrs


def register_and_login(client, username):
    status, body, _ = client.json("POST", "/api/auth/register",
                                  {"username": username, "password": PASSWORD,
                                   "email": f"{username}@audit.local"})
    if status != 200 or body.get("code") != 0:
        raise RuntimeError(f"register {username} failed: {status} {body}")
    status, body, _ = client.json("POST", "/api/auth/login",
                                  {"email": username, "password": PASSWORD})
    if status != 200 or body.get("code") != 0:
        raise RuntimeError(f"login {username} failed: {status} {body}")
    return body["data"]["user"]["id"]


def chunked_request(method, path, chunks, headers=None):
    """裸 HTTP chunked 请求（urllib 不支持 Transfer-Encoding: chunked）"""
    conn = http.client.HTTPConnection(PARSED.hostname, PARSED.port or 80, timeout=30)
    hdrs = {"Content-Type": "application/json", "Host": PARSED.netloc,
            "X-Real-IP": "10.99.0.77"}
    hdrs.update(headers or {})
    conn.request(method, path, body=iter(chunks), headers=hdrs, encode_chunked=True)
    resp = conn.getresponse()
    payload = resp.read()
    status = resp.status
    conn.close()
    return status, payload


created_files = []


def main():
    anon = Client("anon", "10.90.0.1")
    admin = Client("admin", "10.90.1.1")
    uploader = Client("uploader", "10.90.2.1")
    victim2 = Client("victim2", "10.90.3.1")
    fa = Client("fa", "10.90.4.1")
    fb = Client("fb", "10.90.5.1")

    # ── 0. 健康检查 + 管理员自举 ─────────────────────────────────────
    status, _, _ = anon.request("GET", "/")
    check("健康检查 GET / 返回 200", status == 200, f"got {status}")

    admin_name = f"{PREFIX}_adm"
    register_and_login(admin, admin_name)
    r = mysql_run(f"UPDATE users SET role='admin' WHERE username='{admin_name}'")
    if r.returncode != 0:
        raise RuntimeError(f"admin promote failed: {r.stderr[:200]}")
    # 自证准备动作生效：token 里的 role 还是 user，重新登录拿 admin token
    status, body, _ = admin.json("POST", "/api/auth/login",
                                 {"email": admin_name, "password": PASSWORD})
    check("管理员自举成功（重登拿到 admin token）",
          status == 200 and body.get("data", {}).get("user", {}).get("role") == "admin",
          f"got {status} {str(body)[:150]}")
    status, _, _ = admin.json("GET", "/api/admin/users?page=1&page_size=1")
    check("管理员可访问后台接口（准备动作自证）", status == 200, f"got {status}")

    # ── F2a. 删用户后旧 token 立即失效 ──────────────────────────────
    victim = Client("victim", "10.90.6.1")
    victim_name = f"{PREFIX}_victim"
    victim_id = register_and_login(victim, victim_name)
    status, _, _ = victim.json("GET", "/api/videos/mine")
    check("F2a 前置：victim 登录态有效", status == 200, f"got {status}")
    status, body, _ = admin.json("DELETE", f"/api/admin/users/{victim_id}")
    check("F2a 管理员删除用户成功", status == 200, f"got {status} {str(body)[:150]}")
    status, _, _ = victim.json("GET", "/api/videos/mine")
    check("F2a 删除后旧 token 访问受保护接口 → 401", status == 401, f"got {status}")

    # ── F2b. 降角色后旧 admin token 立即失效 ────────────────────────
    v2_name = f"{PREFIX}_v2"
    v2_id = register_and_login(victim2, v2_name)
    mysql_run(f"UPDATE users SET role='admin' WHERE username='{v2_name}'")
    status, body, _ = victim2.json("POST", "/api/auth/login",
                                   {"email": v2_name, "password": PASSWORD})
    check("F2b 前置：victim2 提升后重登为 admin",
          status == 200 and body.get("data", {}).get("user", {}).get("role") == "admin")
    status, _, _ = victim2.json("GET", "/api/admin/users?page=1&page_size=1")
    check("F2b 前置：victim2 的 admin token 有效", status == 200, f"got {status}")
    status, body, _ = admin.json("PUT", f"/api/admin/users/{v2_id}/role", {"role": "user"})
    check("F2b 管理员降角色成功", status == 200, f"got {status} {str(body)[:150]}")
    status, _, _ = victim2.json("GET", "/api/admin/users?page=1&page_size=1")
    check("F2b 降角色后旧 admin token → 401/403", status in (401, 403), f"got {status}")
    status, _, _ = victim2.json("GET", "/api/videos/mine")
    check("F2b 降角色后旧 token 完全失效（普通接口也 401）", status == 401, f"got {status}")

    # ── F3. chunked 绕过 body 限额 ──────────────────────────────────
    big = b"a" * (1024 * 1024 + 512 * 1024)  # 1.5MB > 登录路径 1MB cap
    status, payload = chunked_request("POST", "/api/auth/login", [big])
    check("F3 chunked 1.5MB 打登录接口 → 413", status == 413,
          f"got {status} {payload[:120]!r}")
    # 负向对照：合法小 body 走 chunked 不能被误杀（应在业务层拒绝而不是 413）
    small = json.dumps({"email": "nobody", "password": "wrong"}).encode()
    status, payload = chunked_request("POST", "/api/auth/login", [small])
    check("F3 负向对照：chunked 小 body 不被 413 误杀", status in (400, 401),
          f"got {status} {payload[:120]!r}")

    # ── F6. 未过审视频公开读取闸 ────────────────────────────────────
    up_name = f"{PREFIX}_up"
    register_and_login(uploader, up_name)
    webm = b"\x1a\x45\xdf\xa3" + b"\x00" * 1020  # EBML magic，1KB 合法头
    status, body, _ = uploader.json("POST", "/api/videos/upload/init",
                                    {"file_size": len(webm), "filename": "probe.webm"})
    if status != 200 or body.get("code") != 0:
        raise RuntimeError(f"upload init failed: {status} {body}")
    upload_id = body["data"]["upload_id"]
    status, _, raw = uploader.request(
        "PUT", f"/api/videos/upload/{upload_id}", webm,
        {"Content-Range": f"bytes 0-{len(webm) - 1}/{len(webm)}"})
    check("F6 前置：分片上传成功", status == 200, f"got {status} {raw[:150]!r}")
    status, body, _ = uploader.json("POST", f"/api/videos/upload/{upload_id}/complete")
    check("F6 前置：complete 落库 pending",
          status == 200 and body.get("data", {}).get("status") == "pending",
          f"got {status} {str(body)[:150]}")
    status, body, _ = uploader.json("GET", "/api/videos/mine")
    videos = body.get("data", {}).get("videos", [])
    mine = next((v for v in videos if v.get("status") == "pending"), None)
    if not mine:
        raise RuntimeError(f"no pending submission found: {body}")
    sub_id, fname = mine["id"], mine["filename"]
    created_files.append(fname)

    status, _, _ = anon.request("GET", f"/api/videos/file/{fname}")
    check("F6 pending 匿名读取 → 404", status == 404, f"got {status}")
    status, _, _ = uploader.request("GET", f"/api/videos/file/{fname}")
    check("F6 pending 投稿人本人可预览 → 200", status == 200, f"got {status}")
    status, _, _ = admin.json("PUT", f"/api/videos/{sub_id}/status", {"status": "approved"})
    check("F6 管理员审核通过", status == 200, f"got {status}")
    status, _, _ = anon.request("GET", f"/api/videos/file/{fname}")
    check("F6 approved 匿名读取 → 200", status == 200, f"got {status}")
    status, _, _ = admin.json("PUT", f"/api/videos/{sub_id}/status", {"status": "rejected"})
    check("F6 管理员驳回", status == 200, f"got {status}")
    status, _, _ = anon.request("GET", f"/api/videos/file/{fname}")
    check("F6 rejected 匿名读取 → 404", status == 404, f"got {status}")
    status, _, _ = uploader.json("DELETE", f"/api/videos/{sub_id}")
    check("F6 清理：投稿人删除投稿", status == 200, f"got {status}")

    # ── F11. 登录错误文案（前端透传的后端契约）─────────────────────
    status, body, _ = anon.json("POST", "/api/auth/login",
                                {"email": admin_name, "password": "WrongPass1"})
    check("F11 错误密码 → 401 且 message 非空（前端可透传）",
          status == 401 and bool(body.get("message")), f"got {status} {str(body)[:150]}")

    # ── F15. follow/unfollow 幂等且不再假成功 ───────────────────────
    fa_name, fb_name = f"{PREFIX}_fa", f"{PREFIX}_fb"
    register_and_login(fa, fa_name)
    register_and_login(fb, fb_name)
    status, body, _ = fa.json("POST", f"/api/users/{fb_name}/follow")
    check("F15 关注成功", status == 200 and body.get("data", {}).get("is_following") is True,
          f"got {status} {str(body)[:150]}")
    status, body, _ = fa.json("POST", f"/api/users/{fb_name}/follow")
    check("F15 重复关注幂等（不 500）", status == 200, f"got {status}")
    status, body, _ = fa.json("DELETE", f"/api/users/{fb_name}/follow")
    check("F15 取消关注成功", status == 200 and body.get("data", {}).get("is_following") is False,
          f"got {status} {str(body)[:150]}")

    # ── F1. Redis 脏缓存不崩（仅 Redis 可用时）─────────────────────
    status, hdrs, _ = anon.request("GET", "/api/search?keyword=auditfixprobe&page=1&page_size=5")
    cache_mode = next((v for k, v in hdrs.items() if k.lower() == "x-search-cache"), "")
    if status != 200 or cache_mode in ("", "bypass", "disabled") or not REDISCLI:
        skip("F1 脏缓存 double-free", f"Redis 不可用或无 redis-cli（X-Search-Cache={cache_mode!r}）")
    else:
        cfg = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        renv = os.environ.copy()
        if cfg.get("redis_password"):
            renv["REDISCLI_AUTH"] = cfg["redis_password"]
        rhost = str(cfg.get("redis_host", "127.0.0.1"))
        rport = str(cfg.get("redis_port", 6379))

        def rcli(*args):
            return subprocess.run([REDISCLI, "-h", rhost, "-p", rport, *args],
                                  env=renv, capture_output=True, text=True, timeout=10)

        epoch = rcli("GET", "search:v4:epoch").stdout.strip() or "0"
        key = f"search:v4:public:{epoch}:1:5:auditfixprobe"
        rcli("SET", key, "not-json{{{", "EX", "300")
        status, body, _ = anon.request("GET", "/api/search?keyword=auditfixprobe&page=1&page_size=5")
        ok_json = False
        try:
            ok_json = json.loads(body).get("code") == 0
        except Exception:
            pass
        check("F1 脏缓存命中后服务不崩、回源返回正常 JSON", status == 200 and ok_json,
              f"got {status} {body[:120]!r}")
        status, _, _ = anon.request("GET", "/")
        check("F1 脏缓存后健康检查仍 200（进程存活）", status == 200, f"got {status}")
        rcli("DEL", key)

    return 0 if not failures else 1


def cleanup():
    # 磁盘残留兜底（正常路径已在用例里删除投稿）
    for fname in created_files:
        try:
            (VIDEO_DIR / fname).unlink(missing_ok=True)
        except OSError:
            pass
    mysql_run(f"DELETE FROM users WHERE username LIKE '{PREFIX}_%'")
    left = mysql_run(f"SELECT COUNT(*) FROM users WHERE username LIKE '{PREFIX}_%'")
    print(f"CLEANUP 剩余测试用户 = {left.stdout.strip()}")


if __name__ == "__main__":
    try:
        code = main()
    finally:
        cleanup()
    print(f"\n{len(checks) - len(failures)}/{len(checks)} checks passed"
          + (f", {len(failures)} FAILED: {failures}" if failures else ""))
    sys.exit(code)