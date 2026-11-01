#!/usr/bin/env python3
"""A 类修复端到端校验（cover / visibility / 粉丝计数 / tags+read_minutes / 中文搜索）。

前提：
  1. 后端已启动（默认 http://127.0.0.1:8089）
  2. config/config.json 里的 MySQL 可直接访问（用于临时提升/清理测试管理员）
  3. 本机有 mysql CLI（用于 role 提升与 finally 清理）

脚本会创建 a2fix_<timestamp>_* 测试账号，结束时按前缀清理。
"""

import json
import os
import shutil
import subprocess
import sys
import time

import requests

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# @cuiruoni+B17：同时接受 BLOG_API_BASE，接入 CTest 后一个环境变量就能驱动全部脚本
BASE = os.environ.get("BLOG_BASE") or os.environ.get("BLOG_API_BASE") or "http://127.0.0.1:8089"
CONFIG_PATH = os.path.join(ROOT, "config", "config.json")
MYSQL = shutil.which("mysql") or r"C:\Program Files\MySQL\MySQL Server 9.3\bin\mysql.exe"

PASSWORD = "TestA2fix123"
PREFIX = f"a2fix_{int(time.time())}"
USER_A = f"{PREFIX}_a"
USER_B = f"{PREFIX}_b"
USER_ADMIN = f"{PREFIX}_adm"
TAG = f"{PREFIX}_tag"

checks = []
failures = []


def check(name, ok, detail=""):
    checks.append((name, bool(ok)))
    if ok:
        print(f"PASS  {name}")
    else:
        failures.append(name)
        print(f"FAIL  {name}  {detail}")


_CLIENT_IP_SEQ = [0]


def new_session():
    s = requests.Session()
    s.trust_env = False  # 忽略 HTTP_PROXY，避免请求被代理吞掉
    # @cuiruoni+B17：Redis 起来后限流真正生效，每个角色独占一个 X-Real-IP 桶，
    # @cuiruoni+否则多个脚本共用 127.0.0.1 会在 60 秒窗口里把 register(5/min) 打满
    _CLIENT_IP_SEQ[0] += 1
    s.headers.update({"X-Real-IP": f"10.77.0.{_CLIENT_IP_SEQ[0]}"})
    return s


def call(s, method, path, expected=None, **kwargs):
    r = s.request(method, BASE + path, timeout=20, **kwargs)
    try:
        payload = r.json()
    except Exception:
        payload = {}
    if expected is not None:
        check(f"{method} {path} -> {expected}", r.status_code == expected,
              f"got {r.status_code}: {r.text[:300]}")
    return r, payload


def data_of(payload):
    return payload.get("data") or {}


def ids_of_posts(payload):
    return {p.get("id") for p in (data_of(payload).get("posts") or [])}


def ids_of_results(payload):
    return {p.get("id") for p in (data_of(payload).get("results") or [])}


def mysql_run(sql, database=True):
    cfg = json.load(open(CONFIG_PATH, encoding="utf-8"))
    env = os.environ.copy()
    env["MYSQL_PWD"] = cfg["db_password"]
    args = [MYSQL, "-h", "127.0.0.1", "-P", "3306", "-u", cfg["db_user"], "-N", "-B", "-e", sql]
    if database:
        args.insert(-2, cfg["db_name"])
    return subprocess.run(args, env=env, capture_output=True, text=True, timeout=20)


def promote_admin(username):
    sql = f"UPDATE users SET role='admin' WHERE username='{username}'"
    res = mysql_run(sql)
    if res.returncode != 0:
        print(f"WARN mysql promote failed: {res.stderr.strip()}")
        return False
    role = mysql_run(f"SELECT role FROM users WHERE username='{username}'").stdout.strip()
    return role == "admin"


def register(name):
    s = new_session()
    r, payload = call(s, "POST", "/api/auth/register", 200,
                      json={"username": name, "email": name + "@example.com", "password": PASSWORD})
    return s, data_of(payload).get("user") or {}


def login(name):
    s = new_session()
    _, payload = call(s, "POST", "/api/auth/login", 200,
                      json={"username": name, "password": PASSWORD})
    return s, data_of(payload).get("user") or {}


def create_post(s, title, content, visibility, cover=""):
    body = {
        "title": title,
        "content_md": content,
        "summary": "",
        "status": "published",
        "tags": [TAG],
        "visibility": visibility,
        "cover": cover,
    }
    _, payload = call(s, "POST", "/api/posts", 201, json=body)
    return data_of(payload)


def update_post(s, post_id, title, content, visibility, cover):
    body = {
        "title": title,
        "content_md": content,
        "summary": "",
        "status": "published",
        "tags": [TAG],
        "visibility": visibility,
        "cover": cover,
    }
    _, payload = call(s, "PUT", f"/api/posts/{post_id}", 200, json=body)
    return data_of(payload)


def main():
    anon = new_session()

    # 1. 注册 A / B / 管理员候选
    sa, user_a = register(USER_A)
    sb, user_b = register(USER_B)
    register(USER_ADMIN)
    check("注册三个测试账号", bool(user_a.get("id") and user_b.get("id")),
          f"a={user_a} b={user_b}")

    # 2. 直接改库提升 role，再重新登录拿含 admin 的 JWT
    check("MySQL 提升管理员 role", promote_admin(USER_ADMIN))
    sadm, admin_user = login(USER_ADMIN)
    check("管理员登录后 role=admin", admin_user.get("role") == "admin", f"user={admin_user}")

    # 3. A 创建 public / members / private 三篇 + 一篇长文
    suffix = f"{PREFIX}"
    public = create_post(
        sa, f"公开文章 {suffix}",
        "公开可见的内容。这是一篇用于验证中文检索的文章，关键词是检索和博客。",
        "public", "/api/upload/file/cover-a.png")
    members = create_post(
        sa, f"会员文章 {suffix}",
        "会员可见的内容。会员检索关键词只应该让登录用户看到。",
        "members", "/api/upload/file/cover-m.png")
    private = create_post(
        sa, f"私密文章 {suffix}",
        "仅作者可见的内容。私密关键词。",
        "private", "/api/upload/file/cover-p.png")
    long_content = "长文内容" * 700  # 1400 个字符 -> read_minutes >= 3
    long_post = create_post(
        sa, f"长文 {suffix}", long_content, "public", "")

    pid_public = public.get("id")
    pid_members = members.get("id")
    pid_private = private.get("id")
    pid_long = long_post.get("id")
    check("创建三篇可见性文章", all([pid_public, pid_members, pid_private]))
    check("创建响应回显 cover", public.get("cover") == "/api/upload/file/cover-a.png",
          f"cover={public.get('cover')}")
    check("创建响应回显 visibility", public.get("visibility") == "public"
          and members.get("visibility") == "members"
          and private.get("visibility") == "private")
    check("创建响应回显 tags", public.get("tags") == [TAG], f"tags={public.get('tags')}")

    # 4. 匿名列表 / 详情 / 评论
    _, listing = call(anon, "GET", "/api/posts?page=1&page_size=50", 200)
    ids = ids_of_posts(listing)
    check("匿名列表只出现 public", pid_public in ids and pid_long in ids
          and pid_members not in ids and pid_private not in ids)
    _, detail_public = call(anon, "GET", f"/api/posts/{pid_public}", 200)
    d = data_of(detail_public)
    check("匿名可见 public 详情", d.get("id") == pid_public)
    check("详情回显 cover/visibility/tags/read_minutes",
          d.get("cover") == "/api/upload/file/cover-a.png"
          and d.get("visibility") == "public"
          and d.get("tags") == [TAG]
          and isinstance(d.get("read_minutes"), int))
    call(anon, "GET", f"/api/posts/{pid_members}", 404)
    call(anon, "GET", f"/api/posts/{pid_private}", 404)
    call(anon, "GET", f"/api/posts/{pid_members}/comments", 404)
    call(anon, "GET", f"/api/posts/{pid_private}/comments", 404)

    # 5. 列表 tags / read_minutes
    public_card = next((p for p in (data_of(listing).get("posts") or [])
                        if p.get("id") == pid_public), {})
    long_card = next((p for p in (data_of(listing).get("posts") or [])
                      if p.get("id") == pid_long), {})
    check("列表卡片带 tags", public_card.get("tags") == [TAG], f"card={public_card}")
    check("长文 read_minutes >= 3", (long_card.get("read_minutes") or 0) >= 3,
          f"read_minutes={long_card.get('read_minutes')}")

    # 6. 标签计数与标签文章列表（匿名）
    _, tags_payload = call(anon, "GET", "/api/tags", 200)
    tag_row = next((t for t in (data_of(tags_payload).get("tags") or [])
                    if t.get("name") == TAG), {})
    check("匿名标签计数只算 public", tag_row.get("post_count") == 2,
          f"tag={tag_row}")
    tag_id = tag_row.get("id")
    _, tag_posts = call(anon, "GET", f"/api/tags/{tag_id}/posts", 200)
    tag_ids = ids_of_posts(tag_posts)
    check("匿名标签文章只出现 public", pid_public in tag_ids and pid_long in tag_ids
          and pid_members not in tag_ids and pid_private not in tag_ids)

    # 7. B 登录后的可见性 / 评论 / 收藏
    sb, _ = login(USER_B)
    call(sb, "GET", f"/api/posts/{pid_members}", 200)
    call(sb, "GET", f"/api/posts/{pid_private}", 404)
    call(sb, "POST", f"/api/posts/{pid_private}/comments", 404,
         json={"content": "不应该成功的评论"})
    call(sb, "POST", f"/api/posts/{pid_members}/comments", 201,
         json={"content": "会员文章评论"})
    call(sb, "POST", f"/api/posts/{pid_private}/like", 404)
    call(sb, "POST", f"/api/posts/{pid_members}/bookmark", 200)
    _, b_tag_posts = call(sb, "GET", f"/api/tags/{tag_id}/posts", 200)
    b_tag_ids = ids_of_posts(b_tag_posts)
    check("登录用户标签结果含 members", pid_members in b_tag_ids)
    _, b_tags_payload = call(sb, "GET", "/api/tags", 200)
    b_tag_row = next((t for t in (data_of(b_tags_payload).get("tags") or [])
                      if t.get("name") == TAG), {})
    check("登录用户标签计数含 members", b_tag_row.get("post_count") == 3,
          f"tag={b_tag_row}")

    # 8. 作者本人 / 管理员可见 private
    call(sa, "GET", f"/api/posts/{pid_private}", 200)
    call(sadm, "GET", f"/api/posts/{pid_private}", 200)

    # 9. 中文全文检索（public / members 分离）
    _, anon_search = call(anon, "GET", "/api/search?q=%E6%A3%80%E7%B4%A2", 200)
    anon_result_ids = ids_of_results(anon_search)
    check("匿名中文搜索命中 public", pid_public in anon_result_ids,
          f"results={anon_result_ids}")
    check("匿名中文搜索不含 members", pid_members not in anon_result_ids)
    _, b_search = call(sb, "GET", "/api/search?q=%E4%BC%9A%E5%91%98%E6%A3%80%E7%B4%A2", 200)
    check("登录中文搜索命中 members", pid_members in ids_of_results(b_search))
    _, anon_member_search = call(anon, "GET", "/api/search?q=%E4%BC%9A%E5%91%98%E6%A3%80%E7%B4%A2", 200)
    check("匿名中文搜索不含 members 关键词", pid_members not in ids_of_results(anon_member_search))

    # 10. 关注计数
    call(sa, "POST", f"/api/users/{USER_B}/follow", 200)
    _, profile_a = call(sa, "GET", "/api/users/profile", 200)
    _, profile_b = call(sb, "GET", "/api/users/profile", 200)
    check("A 的 following_count=1", data_of(profile_a).get("following_count") == 1,
          f"profile={data_of(profile_a)}")
    check("B 的 follower_count=1", data_of(profile_b).get("follower_count") == 1,
          f"profile={data_of(profile_b)}")

    # 11. 封面更新 / 清空
    updated = update_post(sa, pid_public, f"公开文章 {suffix}",
                          "公开可见的内容。这是一篇用于验证中文检索的文章，关键词是检索和博客。",
                          "public", "/api/upload/file/cover-b.png")
    check("更新后 cover 回显", updated.get("cover") == "/api/upload/file/cover-b.png")
    _, detail_updated = call(anon, "GET", f"/api/posts/{pid_public}", 200)
    check("详情 cover 已更新", data_of(detail_updated).get("cover") == "/api/upload/file/cover-b.png")
    cleared = update_post(sa, pid_public, f"公开文章 {suffix}",
                          "公开可见的内容。这是一篇用于验证中文检索的文章，关键词是检索和博客。",
                          "public", "")
    check("清空封面回显为空串", cleared.get("cover") == "")
    _, listing_after = call(anon, "GET", "/api/posts?page=1&page_size=50", 200)
    card_after = next((p for p in (data_of(listing_after).get("posts") or [])
                       if p.get("id") == pid_public), {})
    check("列表 cover 已清空", card_after.get("cover") == "")

    # 12. members 改 private 后，B 的标签/收藏不再泄露
    update_post(sa, pid_members, f"会员文章 {suffix}",
                "会员可见的内容。会员检索关键词只应该让登录用户看到。",
                "private", "/api/upload/file/cover-m.png")
    _, b_tag_after = call(sb, "GET", f"/api/tags/{tag_id}/posts", 200)
    check("改为 private 后 B 的标签结果不再含该文", pid_members not in ids_of_posts(b_tag_after))
    _, b_bookmarks = call(sb, "GET", "/api/posts/bookmarked?page=1&page_size=50", 200)
    check("改为 private 后 B 的收藏列表不再含该文", pid_members not in ids_of_posts(b_bookmarks))

    # 13. 公开主页只展示 public
    _, public_profile = call(anon, "GET", f"/api/users/{USER_A}", 200)
    profile_post_ids = {p.get("id") for p in (data_of(public_profile).get("posts") or [])}
    check("公开主页只出现 public", pid_public in profile_post_ids
          and pid_members not in profile_post_ids and pid_private not in profile_post_ids)


if __name__ == "__main__":
    try:
        main()
    finally:
        # 按测试前缀清理。注意：当前库的 posts.user_id 外键并未真正级联删除，
        # 直接 DELETE users 会报 1451，所以按依赖顺序显式删除并临时关闭外键检查。
        try:
            cleanup_sql = f"""
SET FOREIGN_KEY_CHECKS=0;
DELETE FROM comments WHERE post_id IN (SELECT id FROM posts WHERE user_id IN (SELECT id FROM users WHERE username LIKE '{PREFIX}%'));
DELETE FROM post_tags WHERE post_id IN (SELECT id FROM posts WHERE user_id IN (SELECT id FROM users WHERE username LIKE '{PREFIX}%'));
DELETE FROM post_likes WHERE post_id IN (SELECT id FROM posts WHERE user_id IN (SELECT id FROM users WHERE username LIKE '{PREFIX}%')) OR user_id IN (SELECT id FROM users WHERE username LIKE '{PREFIX}%');
DELETE FROM post_bookmarks WHERE post_id IN (SELECT id FROM posts WHERE user_id IN (SELECT id FROM users WHERE username LIKE '{PREFIX}%')) OR user_id IN (SELECT id FROM users WHERE username LIKE '{PREFIX}%');
DELETE FROM follows WHERE follower_id IN (SELECT id FROM users WHERE username LIKE '{PREFIX}%') OR followee_id IN (SELECT id FROM users WHERE username LIKE '{PREFIX}%');
DELETE FROM notifications WHERE user_id IN (SELECT id FROM users WHERE username LIKE '{PREFIX}%') OR actor_name IN (SELECT username FROM users WHERE username LIKE '{PREFIX}%');
DELETE FROM posts WHERE user_id IN (SELECT id FROM users WHERE username LIKE '{PREFIX}%');
DELETE FROM video_submissions WHERE uploader_id IN (SELECT id FROM users WHERE username LIKE '{PREFIX}%');
DELETE FROM tags WHERE name LIKE '{PREFIX}%';
DELETE FROM users WHERE username LIKE '{PREFIX}%';
SET FOREIGN_KEY_CHECKS=1;
"""
            res = mysql_run(cleanup_sql)
            if res.returncode != 0:
                print(f"WARN cleanup failed: {res.stderr.strip()}")
        except Exception as exc:  # noqa: BLE001
            print(f"WARN cleanup exception: {exc}")

    total = len(checks)
    passed = sum(1 for _, ok in checks if ok)
    print(f"\n{passed}/{total} checks passed")
    if failures:
        print("FAILED: " + ", ".join(failures))
        sys.exit(1)
    sys.exit(0)
