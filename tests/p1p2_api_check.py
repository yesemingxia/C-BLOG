#!/usr/bin/env python3
"""P1/P2 接口级回归（B2/B3/B4/B5/B9/B10/B12/B13/B14，可选 B6/B7/B8）。

前置：
  - 后端已启动（默认 http://127.0.0.1:8089），并且**必须**用 TRUST_PROXY_REAL_IP=true 起：
        TRUST_PROXY_REAL_IP=true ./build/Release/blog.exe --config config/config.json
    脚本靠 X-Real-IP 给每个客户端分桶；后端默认不认这个头（否则任何人换个值就能绕过限流），
    没开的话整轮请求共用 TCP 对端一个桶，会在 60/min、register 5/min 处成片 429。
  - MySQL 可用；Redis 可选 —— 没起时限流不拦、搜索缓存断言按 X-Search-Cache 自动降级跳过
  - 管理员相关用例（B6/B7/B8/B12 视频审核通知）需要环境变量：
        BLOG_ADMIN_USERNAME=... BLOG_ADMIN_PASSWORD=...
    库里默认没有 role='admin' 的账号：注册一个，再 UPDATE users SET role='admin' 即可。

用法：
  python tests/p1p2_api_check.py
  BLOG_API_BASE=http://127.0.0.1:8089 python tests/p1p2_api_check.py

测试数据在 finally 中清理；标签行因没有删除接口可能残留（前缀 p1p2_*）。
"""

import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from http.cookiejar import CookieJar
from pathlib import Path

BASE = os.environ.get("BLOG_API_BASE", "http://127.0.0.1:8089").rstrip("/")
REPO_ROOT = Path(__file__).resolve().parents[1]
VIDEO_DIR = REPO_ROOT / "uploads" / "videos"
CORS_ORIGIN = os.environ.get("BLOG_CORS_ORIGIN", "http://localhost:5173")

PREFIX = f"p1p2_{int(time.time())}"
PASSWORD = "Passw0rd9"

checks = 0
failures = []


def check(cond, label, extra=""):
    global checks
    checks += 1
    if not cond:
        failures.append(f"{label} {extra}".strip())
        print(f"FAIL  {label} {extra}".rstrip())
    else:
        print(f"ok    {label}")


def header(headers, name):
    for key, value in headers.items():
        if key.lower() == name.lower():
            return value
    return ""


class Client:
    def __init__(self, name, ip):
        self.name = name
        self.ip = ip
        self.ip_prefix = ip.rsplit(".", 1)[0]
        self.ip_host = int(ip.rsplit(".", 1)[1])
        self._seq = 0
        self.jar = CookieJar()
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(self.jar)
        )

    def request(self, method, path, body=None, headers=None):
        data = None
        # @cuiruoni+B17：一个角色一轮回归会打满 60+ 次请求，单桶会被 default(60/min) 限住；
        # @cuiruoni+Redis 起来后限流是真生效的，所以每个角色在自己的 /24 里轮转 8 个桶
        self._seq += 1
        merged = {"X-Real-IP": f"{self.ip_prefix}.{self.ip_host + 8 * (self._seq % 8)}"}
        if isinstance(body, (bytes, bytearray)):
            # @cuiruoni+B12 用例要 PUT 二进制分片（配 Content-Range），不能走 JSON 编码
            data = bytes(body)
            merged["Content-Type"] = "application/octet-stream"
        elif body is not None:
            data = json.dumps(body).encode("utf-8")
            merged["Content-Type"] = "application/json"
        merged.update(headers or {})
        req = urllib.request.Request(
            BASE + path, data=data, headers=merged, method=method
        )
        try:
            with self.opener.open(req, timeout=30) as resp:
                payload = resp.read()
                return resp.status, dict(resp.headers), payload
        except urllib.error.HTTPError as exc:
            payload = exc.read()
            # @cuiruoni+后端默认不认 X-Real-IP（防限流被伪造头绕过），忘了开开关时表现是一成片 429，
            # @cuiruoni+这里直接点出来，免得被当成业务失败去查代码
            if exc.code == 429 and b"Too many requests" in payload:
                print(f"warn  {self.name} {method} {path} 被限流：后端需要带 "
                      f"TRUST_PROXY_REAL_IP=true 启动，脚本的 X-Real-IP 分桶才生效")
            return exc.code, dict(exc.headers), payload

    def json(self, method, path, body=None, headers=None, expect=200):
        status, resp_headers, payload = self.request(method, path, body, headers)
        try:
            parsed = json.loads(payload.decode("utf-8")) if payload else {}
        except Exception:
            parsed = {}
        if status != expect:
            raise AssertionError(
                f"{self.name} {method} {path}: expected {expect}, got {status}: {payload[:300]!r}"
            )
        return parsed, resp_headers


def register(client, username, email):
    body = {"username": username, "password": PASSWORD}
    if email:
        body["email"] = email
    data, _ = client.json("POST", "/api/auth/register", body)
    assert data.get("code") == 0, data
    return data["data"]["user"]


def login(client, email):
    data, _ = client.json("POST", "/api/auth/login", {"email": email, "password": PASSWORD})
    assert data.get("code") == 0, data
    return data["data"]["user"]


def create_post(client, title, content, visibility="public", tags=None, cover=""):
    data, _ = client.json("POST", "/api/posts", {
        "title": title,
        "content_md": content,
        "summary": "p1p2 summary",
        "status": "published",
        "visibility": visibility,
        "tags": tags or [],
        "cover": cover,
    }, expect=201)
    assert data.get("code") == 0, data
    return data["data"]


def delete_post(client, post_id):
    try:
        client.json("DELETE", f"/api/posts/{post_id}")
    except Exception as exc:
        print(f"warn  cleanup post {post_id}: {exc}")


def self_delete(client, password):
    status, _, _ = client.request("DELETE", "/api/users/me", {"password": password})
    return status


def main():
    admin_user = os.environ.get("BLOG_ADMIN_USERNAME", "")
    admin_pass = os.environ.get("BLOG_ADMIN_PASSWORD", "")

    a = Client("A", "10.90.0.11")
    b = Client("B", "10.90.0.12")
    c = Client("C", "10.90.0.13")
    anon = Client("anon", "10.90.0.14")

    user_a = user_b = user_c = None
    created_posts = []
    created_submissions = []
    test_video = None

    try:
        # ---------------- B2 邮箱唯一 / 登录确定性 ----------------
        user_a = register(a, f"{PREFIX}_a", f"{PREFIX}_a@example.com")
        user_b = register(b, f"{PREFIX}_b", f"{PREFIX}_b@example.com")

        status, _, _ = c.request("POST", "/api/auth/register", {
            "username": f"{PREFIX}_dup", "password": PASSWORD,
            "email": f"{PREFIX}_a@example.com",
        })
        check(status == 409, "B2 重复邮箱注册被拒", f"status={status}")

        user_c = register(c, f"{PREFIX}_c", "")  # 空邮箱可重复
        logged = login(a, f"{PREFIX}_a@example.com")
        check(logged["username"] == user_a["username"], "B2 邮箱登录命中正确账号")

        data, _ = a.json("PUT", "/api/users/profile", {"email": f"{PREFIX}_b@example.com"}, expect=409)
        check(True, "B2 改资料占用他人邮箱被拒")

        # ---------------- B3 PUT 部分更新（资料） ----------------
        a.json("PUT", "/api/users/profile", {"location": "上海"})
        a.json("PUT", "/api/users/profile", {"bio": "只改简介"})
        profile, _ = a.json("GET", "/api/users/profile")
        pd = profile["data"]
        check(pd["bio"] == "只改简介" and pd["location"] == "上海", "B3 只改简介不动所在地")
        check(pd["email"] == f"{PREFIX}_a@example.com", "B3 只改简介不动邮箱")

        # ---------------- B3 PUT 部分更新 ----------------
        post1 = create_post(
            a, f"{PREFIX} 文章一", "正文一 中文检索关键字",
            visibility="private", tags=[f"{PREFIX}_tag"], cover="/api/upload/file/x.png",
        )
        post1_id = post1["id"]
        created_posts.append(post1_id)

        data, _ = a.json("PUT", f"/api/posts/{post1_id}", {"title": f"{PREFIX} 文章一（改）"})
        detail, _ = a.json("GET", f"/api/posts/{post1_id}")
        d = detail["data"]
        check(d["content_md"] == "正文一 中文检索关键字", "B3 只改标题不清空正文")
        check(d["cover"] == "/api/upload/file/x.png", "B3 只改标题不清空封面")
        check(d["visibility"] == "private", "B3 只改标题不清空可见性")
        check(d["tags"] == [f"{PREFIX}_tag"], "B3 只改标题不清空标签")

        a.json("PUT", f"/api/posts/{post1_id}", {"visibility": "public"})
        detail, _ = a.json("GET", f"/api/posts/{post1_id}")
        check(detail["data"]["title"] == f"{PREFIX} 文章一（改）", "B3 只改可见性不清空标题")
        check(detail["data"]["visibility"] == "public", "B3 可见性更新成功")

        a.json("PUT", f"/api/posts/{post1_id}", {"cover": ""})
        detail, _ = a.json("GET", f"/api/posts/{post1_id}")
        check(detail["data"]["cover"] == "", "B3 显式空串可以清空封面")

        a.json("PUT", f"/api/posts/{post1_id}", {}, expect=400)
        check(True, "B3 空 patch 返回 400")

        # 只改状态：草稿/发布切换不能动其它字段
        a.json("PUT", f"/api/posts/{post1_id}", {"status": "draft"})
        detail, _ = a.json("GET", f"/api/posts/{post1_id}")
        check(detail["data"]["status"] == "draft" and detail["data"]["visibility"] == "public"
              and detail["data"]["title"] == f"{PREFIX} 文章一（改）",
              "B3 只改状态不动标题/可见性")

        # 正文原样写入：缩进代码块的空格不能被吃掉
        indented = "    缩进代码块\n\n正文"
        a.json("PUT", f"/api/posts/{post1_id}", {"content_md": indented})
        detail, _ = a.json("GET", f"/api/posts/{post1_id}")
        check(detail["data"]["content_md"] == indented, "B3 正文保持原样（含前导缩进）")
        check("<pre" in detail["data"]["content_html"], "B3 改正文后重新渲染 HTML")

        # tags 出现才同步；缺省时保留
        a.json("PUT", f"/api/posts/{post1_id}", {"tags": []})
        detail, _ = a.json("GET", f"/api/posts/{post1_id}")
        check(detail["data"]["tags"] == [], "B3 显式空数组可以清空标签")
        a.json("PUT", f"/api/posts/{post1_id}", {"summary": "只改摘要"})
        detail, _ = a.json("GET", f"/api/posts/{post1_id}")
        check(detail["data"]["tags"] == [] and detail["data"]["summary"] == "只改摘要",
              "B3 缺省 tags 不被重建")

        # 非法枚举必须 400，不能静默降级
        a.json("PUT", f"/api/posts/{post1_id}", {"visibility": "bogus"}, expect=400)
        a.json("PUT", f"/api/posts/{post1_id}", {"status": "archived"}, expect=400)
        check(True, "B3 非法 visibility/status 返回 400")

        # 不存在的文章必须 404，不能“假成功 + 空文章”
        a.json("PUT", "/api/posts/99999999", {"title": "ghost"}, expect=404)
        check(True, "B3 PUT 不存在的文章返回 404")
        a.json("DELETE", "/api/posts/99999999", expect=404)
        check(True, "B3 DELETE 不存在的文章返回 404（同形问题一起收）")

        # PATCH 别名可用
        data, _ = a.json("PATCH", f"/api/posts/{post1_id}", {"summary": "PATCH 摘要"})
        check(data["data"]["summary"] == "PATCH 摘要", "B3 PATCH 别名生效")

        # 复位到后续用例依赖的确定状态（published + public + 带标签 + 有检索关键词）
        a.json("PUT", f"/api/posts/{post1_id}", {
            "title": f"{PREFIX} 文章一（改）",
            "content_md": "正文一 中文检索关键字",
            "summary": "p1p2 summary",
            "status": "published",
            "visibility": "public",
            "tags": [f"{PREFIX}_tag"],
            "cover": "",
        })

        # ---------------- B4 分页夹紧 ----------------
        data, _ = anon.json("GET", "/api/posts?page=-1&page_size=0")
        check(data["data"]["page"] == 1 and data["data"]["page_size"] == 10, "B4 负数页码/零页大小被夹紧")
        data, _ = anon.json("GET", "/api/posts?page=0&page_size=999")
        check(data["data"]["page"] == 1 and data["data"]["page_size"] == 100, "B4 page_size 上限 100")
        mine, _ = a.json("GET", "/api/posts/mine?page=-1&page_size=-9")
        check(mine["data"]["page"] == 1 and mine["data"]["page_size"] == 20,
              "B4 /posts/mine 也走同一夹紧（默认 20）")

        # ---------------- B9 搜索 / 标签分页 ----------------
        for idx in range(2, 5):
            p = create_post(a, f"{PREFIX} 检索 {idx}", f"中文检索关键字 分页测试 {PREFIX} {idx}",
                            tags=[f"{PREFIX}_tag"])
            created_posts.append(p["id"])

        search_q = urllib.parse.quote("中文检索")
        search, headers = anon.json("GET", f"/api/search?q={search_q}&page=1&page_size=2")
        sd = search["data"]
        check(sd["total"] >= 3 and len(sd["results"]) == 2, "B9 搜索结果分页",
              f"total={sd['total']} len={len(sd['results'])}")
        check(sd["page"] == 1 and sd["page_size"] == 2, "B9 搜索回传分页参数")
        s_clamped, _ = anon.json("GET", f"/api/search?q={search_q}&page=-1&page_size=0")
        check(s_clamped["data"]["page"] == 1 and s_clamped["data"]["page_size"] == 10,
              "B4 搜索分页夹紧")
        cache_state = header(headers, "X-Search-Cache")
        _, headers2 = anon.json("GET", f"/api/search?q={search_q}&page=1&page_size=2")
        cache_state2 = header(headers2, "X-Search-Cache")
        if cache_state == "disabled":
            check(True, "B9 Redis 未启用，跳过缓存命中断言")
        else:
            check(cache_state == "miss" and cache_state2 == "hit",
                  "B9 匿名搜索缓存命中", f"{cache_state}->{cache_state2}")

        tags, _ = anon.json("GET", "/api/tags")
        tag_id = next((t["id"] for t in tags["data"]["tags"] if t["name"] == f"{PREFIX}_tag"), None)
        check(tag_id is not None, "B9 测试标签存在")
        if tag_id is not None:
            tagged, _ = anon.json("GET", f"/api/tags/{tag_id}/posts?page=1&page_size=1")
            check(tagged["data"]["total"] >= 3 and len(tagged["data"]["posts"]) == 1,
                  "B9 标签文章分页")
            tag_clamped, _ = anon.json("GET", f"/api/tags/{tag_id}/posts?page=0&page_size=9999")
            check(tag_clamped["data"]["page"] == 1 and tag_clamped["data"]["page_size"] == 100,
                  "B4 标签文章分页夹紧")

        # ---------------- B17 Redis 缓存：epoch 失效 + 登录态隔离 ----------------
        cache_kw = "缓存失效检索"
        cache_post = create_post(a, f"{PREFIX} 缓存文章", f"{cache_kw} 专用正文 {PREFIX}")
        cache_post_id = cache_post["id"]
        created_posts.append(cache_post_id)
        cache_q = urllib.parse.quote(cache_kw)

        _, h_miss = anon.json("GET", f"/api/search?q={cache_q}&page=1&page_size=20")
        body_hit, h_hit = anon.json("GET", f"/api/search?q={cache_q}&page=1&page_size=20")
        if header(h_miss, "X-Search-Cache") == "disabled":
            check(True, "B17 Redis 未启用，跳过缓存失效与登录态隔离断言")
        else:
            check(header(h_miss, "X-Search-Cache") == "miss"
                  and header(h_hit, "X-Search-Cache") == "hit",
                  "B17 匿名搜索先 miss 后 hit",
                  f"{header(h_miss, 'X-Search-Cache')}->{header(h_hit, 'X-Search-Cache')}")
            check(cache_post_id in [r["id"] for r in body_hit["data"]["results"]],
                  "B17 缓存结果包含新文章")

            # 文章转 private 必须递增 epoch：旧缓存整体不可达，匿名也搜不到这篇
            a.json("PUT", f"/api/posts/{cache_post_id}", {"visibility": "private"})
            body_after, h_after = anon.json("GET", f"/api/search?q={cache_q}&page=1&page_size=20")
            check(header(h_after, "X-Search-Cache") == "miss",
                  "B17 可见性变化后旧缓存失效", f"got {header(h_after, 'X-Search-Cache')}")
            check(cache_post_id not in [r["id"] for r in body_after["data"]["results"]],
                  "B17 转 private 后匿名搜索不再命中")

            # 同一关键词，登录态直查数据库（不共用匿名缓存），members 文章只对登录用户出现
            member_kw = "会员隔离检索"
            member_post = create_post(a, f"{PREFIX} 会员文章", f"{member_kw} 专用正文 {PREFIX}",
                                      visibility="members")
            member_post_id = member_post["id"]
            created_posts.append(member_post_id)
            member_q = urllib.parse.quote(member_kw)

            anon_member, _ = anon.json("GET", f"/api/search?q={member_q}&page=1&page_size=20")
            check(member_post_id not in [r["id"] for r in anon_member["data"]["results"]],
                  "B17 匿名搜索看不到 members 文章")
            _, h_bypass = b.json("GET", f"/api/search?q={member_q}&page=1&page_size=20")
            check(header(h_bypass, "X-Search-Cache") == "bypass",
                  "B17 登录态搜索不读缓存", f"got {header(h_bypass, 'X-Search-Cache')}")
            other, _ = b.json("GET", f"/api/search?q={member_q}&page=1&page_size=20")
            check(member_post_id in [r["id"] for r in other["data"]["results"]],
                  "B17 其他登录用户可见 members 文章")

        # ---------------- B5 评论边界 ----------------
        post2 = create_post(a, f"{PREFIX} 文章二", "第二篇正文")
        post2_id = post2["id"]
        created_posts.append(post2_id)

        created, _ = a.json("POST", f"/api/posts/{post1_id}/comments", {"content": "A 的顶级评论"}, expect=201)
        comment_a = created["data"]
        created_b, _ = b.json("POST", f"/api/posts/{post2_id}/comments", {"content": "B 在文章二评论"}, expect=201)
        comment_b = created_b["data"]
        check("author_email" not in comment_a and "author_email" not in comment_b,
              "B5 创建回传不含 author_email（邮箱不外泄）")

        b.json("POST", f"/api/posts/{post1_id}/comments",
               {"content": "跨文章回复", "parent_id": comment_b["id"]}, expect=400)
        check(True, "B5 跨文章父评论被拒")

        reply, _ = b.json("POST", f"/api/posts/{post1_id}/comments",
                          {"content": "同文章回复", "parent_id": comment_a["id"]}, expect=201)
        check(reply["data"]["parent_id"] == comment_a["id"], "B5 同文章回复成功")

        listed, _ = anon.json("GET", f"/api/posts/{post1_id}/comments?page=1&page_size=1")
        check(listed["data"]["total"] == 2 and len(listed["data"]["comments"]) == 1,
              "B5 评论列表分页")

        listed_all, _ = anon.json("GET", f"/api/posts/{post1_id}/comments?page=1&page_size=50")
        check(all("author_email" not in c for c in listed_all["data"]["comments"]),
              "B5 匿名评论列表不回传 author_email")
        # @cuiruoni+B4：评论接口同样要夹紧（负 OFFSET 会让 MySQL 直接报错）
        clamped, _ = anon.json("GET", f"/api/posts/{post1_id}/comments?page=-5&page_size=0")
        check(clamped["data"]["page"] == 1 and clamped["data"]["page_size"] == 50,
              "B4 评论列表分页夹紧")

        b.json("DELETE", f"/api/comments/{comment_a['id']}", expect=403)
        check(True, "B5 非作者不能删评论")
        a.json("DELETE", f"/api/comments/{comment_a['id']}")
        after, _ = anon.json("GET", f"/api/posts/{post1_id}/comments?page=1&page_size=10")
        check(after["data"]["total"] == 0, "B5 作者删除评论且子回复级联删除")

        # ---------------- B12 mention 通知 ----------------
        # 作者已收到 comment 通知，mention 只发给“被提及且不是作者/自己”的用户，这里提 C
        b.json("POST", f"/api/posts/{post1_id}/comments",
               {"content": f"@{user_c['username']} 来看看"}, expect=201)
        notes, _ = c.json("GET", "/api/notifications?page=1&page_size=20")
        nd = notes["data"]
        check(nd["total"] >= 1 and nd["page_size"] == 20 and "notifications" in nd,
              "B12 通知列表分页返回 total/page_size")
        unread_before = nd["unread_count"]
        check(unread_before >= 1, "B12 unread_count 是跨页未读总数", f"unread={unread_before}")
        clamped_notes, _ = c.json("GET", "/api/notifications?page=-2&page_size=0")
        check(clamped_notes["data"]["page"] == 1 and clamped_notes["data"]["page_size"] == 20,
              "B4 通知分页夹紧")
        mention = next((n for n in nd["notifications"] if n.get("type") == "mention"), None)
        check(mention is not None, "B12 @mention 生成通知")
        if mention:
            check(mention.get("post_id") == post1_id, "B12 mention 通知带 post_id")
            check(mention.get("actor_name") == user_b["username"], "B12 mention 通知带 actor")
            c.json("PUT", f"/api/notifications/{mention['id']}/read")
            after_notes, _ = c.json("GET", "/api/notifications?page=1&page_size=20")
            check(after_notes["data"]["unread_count"] == unread_before - 1,
                  "B12 标记已读后 unread_count 同步减一",
                  f"{unread_before}->{after_notes['data']['unread_count']}")

        # ---------------- B14 CORS ----------------
        status, cors_headers, _ = anon.request("OPTIONS", "/api/posts",
                                               headers={"Origin": CORS_ORIGIN})
        check(status == 200, "B14 OPTIONS 预检返回 200")
        check(header(cors_headers, "Access-Control-Allow-Origin") == CORS_ORIGIN,
              "B14 允许来源回显 Origin")
        check("Content-Range" in header(cors_headers, "Access-Control-Allow-Headers"),
              "B14 允许头包含 Content-Range")
        status, bad_headers, _ = anon.request("OPTIONS", "/api/posts",
                                              headers={"Origin": "http://evil.example"})
        check(not header(bad_headers, "Access-Control-Allow-Origin"),
              "B14 非白名单 Origin 不返回 allow-origin")

        # ---------------- B10 视频 Range ----------------
        VIDEO_DIR.mkdir(parents=True, exist_ok=True)
        test_video = VIDEO_DIR / f"{PREFIX}_range.mp4"
        test_video.write_bytes(bytes(range(256)) * 16)  # 4096 bytes
        size = test_video.stat().st_size
        name = test_video.name

        status, h, payload = anon.request("GET", f"/api/videos/file/{name}",
                                          headers={"Range": "bytes=100-199"})
        check(status == 206 and len(payload) == 100, "B10 Range 206 且只返回请求区间",
              f"status={status} len={len(payload)}")
        check(header(h, "Content-Range") == f"bytes 100-199/{size}", "B10 Content-Range 正确")
        check(header(h, "Accept-Ranges") == "bytes", "B10 Accept-Ranges: bytes")

        status, h, payload = anon.request("GET", f"/api/videos/file/{name}")
        check(status == 200 and len(payload) == size, "B10 无 Range 返回完整文件")

        status, h, payload = anon.request("HEAD", f"/api/videos/file/{name}")
        check(status == 200 and len(payload) == 0 and header(h, "Content-Length") == str(size),
              "B10 HEAD 返回长度但不返回 body")

        status, h, payload = anon.request("GET", f"/api/videos/file/{name}",
                                          headers={"Range": "bytes=-50"})
        check(status == 206 and len(payload) == 50, "B10 后缀 Range 正确")

        status, h, _ = anon.request("GET", f"/api/videos/file/{name}",
                                    headers={"Range": f"bytes={size + 10}-"})
        check(status == 416 and header(h, "Content-Range") == f"bytes */{size}",
              "B10 越界 Range 返回 416")

        # ---------------- B13 自助注销 ----------------
        bad = self_delete(c, "WrongPass1")
        check(bad == 400, "B13 注销密码错误被拒", f"status={bad}")
        good = self_delete(c, PASSWORD)
        check(good == 200, "B13 自助注销成功", f"status={good}")
        status, _, _ = c.request("POST", "/api/auth/login",
                                 {"email": f"{PREFIX}_c", "password": PASSWORD})
        check(status in (401, 404), "B13 注销后无法登录", f"status={status}")
        user_c = None

        # ---------------- B11 每用户上传会话限额 ----------------
        upload_ids = []
        for idx in range(3):
            data, _ = a.json("POST", "/api/videos/upload/init",
                             {"file_size": 1024, "filename": f"{PREFIX}_{idx}.mp4"})
            upload_ids.append(data["data"]["upload_id"])
        status, _, _ = a.request("POST", "/api/videos/upload/init",
                                 {"file_size": 1024, "filename": f"{PREFIX}_4.mp4"})
        check(status == 429, "B11 每用户最多 3 个上传会话", f"status={status}")
        for upload_id in upload_ids:
            a.json("DELETE", f"/api/videos/upload/{upload_id}")

        # ---------------- 可选：管理员 B6/B7/B8 ----------------
        if admin_user and admin_pass:
            admin = Client("admin", "10.90.0.19")
            data, _ = admin.json("POST", "/api/auth/login",
                                 {"username": admin_user, "password": admin_pass})
            check(data.get("code") == 0, "管理员登录")

            users, _ = admin.json("GET", f"/api/admin/users?q={PREFIX}_a&page=1&page_size=10")
            check(users["data"]["total"] >= 1 and
                  all(PREFIX in u["username"] or PREFIX in (u["email"] or "")
                      for u in users["data"]["users"]),
                  "B6 后台用户搜索服务端过滤")

            missing, _ = admin.json("GET", "/api/admin/users?q=__no_such_user__&page=1&page_size=10")
            check(missing["data"]["total"] == 0, "B6 搜索无结果 total=0")

            sorted_users, _ = admin.json(
                "GET", "/api/admin/users?sort=username&order=asc&page=1&page_size=10")
            names = [u["username"] for u in sorted_users["data"]["users"]]
            check(names == sorted(names), "B7 用户按用户名升序")

            posts, _ = admin.json(
                "GET", f"/api/admin/posts?q={PREFIX}&sort=view_count&order=desc&page=1&page_size=10")
            check(posts["data"]["total"] >= 1, "B6 后台文章搜索")

            trend, _ = admin.json("GET", "/api/admin/stats/trend?months=3")
            points = trend["data"]["points"]
            check(len(points) == 3 and all(re.fullmatch(r"\d{4}-\d{2}", p["month"]) for p in points),
                  "B8 趋势返回 3 个月且格式正确")

            # ---------------- B12 system 通知：视频审核结果 ----------------
            # 投稿走完整链路（init → PUT 二进制分片 → complete），比直接改库更接近真实用户路径
            # 头部带 ftyp box，否则 complete 的 magic bytes 校验会按“非 MP4/WebM”拒收
            chunk = b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00" + b"p1p2 review payload" * 40
            init, _ = a.json("POST", "/api/videos/upload/init",
                             {"file_size": len(chunk), "filename": f"{PREFIX}_review.mp4"})
            upload_id = init["data"]["upload_id"]
            n = len(chunk)
            status, _, _ = a.request("PUT", f"/api/videos/upload/{upload_id}", chunk,
                                     headers={"Content-Range": f"bytes 0-{n - 1}/{n}"})
            check(status == 200, "B12 上传分片被接受", f"status={status}")
            done, _ = a.json("POST", f"/api/videos/upload/{upload_id}/complete")
            submission_id = done["data"]["id"]
            created_submissions.append(submission_id)

            admin.json("PUT", f"/api/videos/{submission_id}/status", {"status": "approved"})
            notes, _ = a.json("GET", "/api/notifications?page=1&page_size=100")
            system_notes = [x for x in notes["data"]["notifications"] if x.get("type") == "system"]
            check(len(system_notes) >= 1, "B12 审核通过给投稿人生成 system 通知")
            if system_notes:
                check(f"{PREFIX}_review" in (system_notes[0].get("content") or ""),
                      "B12 system 通知正文含投稿名", f"content={system_notes[0].get('content')}")
                check(system_notes[0].get("actor_id"), "B12 system 通知带管理员 actor_id")

            # 状态没变化时不该再刷一条通知（重复点“通过”）
            before = len(system_notes)
            admin.json("PUT", f"/api/videos/{submission_id}/status", {"status": "approved"})
            notes2, _ = a.json("GET", "/api/notifications?page=1&page_size=100")
            after = len([x for x in notes2["data"]["notifications"] if x.get("type") == "system"])
            check(after == before, "B12 状态未变化不重复通知", f"{before}->{after}")
        else:
            print("skip  管理员用例（未设置 BLOG_ADMIN_USERNAME/BLOG_ADMIN_PASSWORD）")

    finally:
        # ---------------- 清理 ----------------
        for post_id in created_posts:
            delete_post(a if user_a else b, post_id)
        # @cuiruoni+B12 用例产生的投稿：删库行同时后端会删掉磁盘上的视频文件
        for submission_id in created_submissions:
            try:
                a.json("DELETE", f"/api/videos/{submission_id}")
            except Exception as exc:
                print(f"warn  cleanup submission {submission_id}: {exc}")
        if test_video and test_video.exists():
            try:
                test_video.unlink()
            except OSError as exc:
                print(f"warn  删除测试视频失败: {exc}")
        for client, user in ((b, user_b), (a, user_a)):
            if user is not None:
                try:
                    self_delete(client, PASSWORD)
                except Exception as exc:
                    print(f"warn  清理用户 {user.get('username')} 失败: {exc}")

    if failures:
        print(f"\n{len(failures)} / {checks} checks FAILED")
        for failure in failures:
            print(" -", failure)
        return 1
    print(f"\nAll {checks} checks passed")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except AssertionError as exc:
        print(f"\nABORT: {exc}")
        sys.exit(1)
