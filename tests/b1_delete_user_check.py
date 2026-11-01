#!/usr/bin/env python3
"""B1 回归：外键 ON DELETE CASCADE + 后台删除用户。

覆盖：
  1. 删除父评论时，子回复随 comments.parent_id CASCADE 一起删除；
  2. 删除用户时，posts → comments/post_tags/likes/bookmarks 级联，
     以及直接挂在 users 上的 follows/notifications/video_submissions 级联；
  3. 被删用户的登录账号消失，其他用户不受影响。

前提：后端已启动（默认 127.0.0.1:8089）、MySQL 可用、本机有 mysql CLI。
脚本创建 b1fix_<timestamp>_* 账号，结束时按前缀清理。
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

PASSWORD = "TestB1fix123"
PREFIX = f"b1fix_{int(time.time())}"
USER_A = f"{PREFIX}_a"
USER_B = f"{PREFIX}_b"
USER_ADMIN = f"{PREFIX}_adm"

checks = []
failures = []


def check(name, ok, detail=""):
    checks.append((name, bool(ok)))
    print(("PASS  " if ok else "FAIL  ") + name + (("  " + str(detail)) if detail and not ok else ""))
    if not ok:
        failures.append(name)


_CLIENT_IP_SEQ = [0]


def new_session():
    s = requests.Session()
    s.trust_env = False
    # @cuiruoni+B17：每个角色独占一个限流桶；与 a2 脚本连跑时共用 127.0.0.1 会撞 register 5/min
    _CLIENT_IP_SEQ[0] += 1
    s.headers.update({"X-Real-IP": f"10.78.0.{_CLIENT_IP_SEQ[0]}"})
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


def data(payload):
    return payload.get("data") or {}


def mysql_run(sql):
    cfg = json.load(open(CONFIG_PATH, encoding="utf-8"))
    env = os.environ.copy()
    env["MYSQL_PWD"] = cfg["db_password"]
    args = [MYSQL, "-h", "127.0.0.1", "-P", "3306", "-u", cfg["db_user"], "-N", "-B", "-e", sql]
    args.insert(-2, cfg["db_name"])
    return subprocess.run(args, env=env, capture_output=True, text=True, timeout=20)


def scalar(sql):
    out = mysql_run(sql).stdout.strip().splitlines()
    return int(out[0]) if out and out[0] else 0


def register(name):
    s = new_session()
    _, payload = call(s, "POST", "/api/auth/register", 200,
                      json={"username": name, "email": name + "@example.com", "password": PASSWORD})
    return s, (data(payload).get("user") or {})


def login(name):
    s = new_session()
    _, payload = call(s, "POST", "/api/auth/login", 200,
                      json={"username": name, "password": PASSWORD})
    return s, (data(payload).get("user") or {})


def main():
    sa, user_a = register(USER_A)
    sb, user_b = register(USER_B)
    register(USER_ADMIN)
    aid = user_a.get("id")
    bid = user_b.get("id")
    check("注册三个测试账号", bool(aid and bid))

    # 提升管理员并重新登录，拿 role=admin 的 JWT
    promote = mysql_run(f"UPDATE users SET role='admin' WHERE username='{USER_ADMIN}'")
    check("提升管理员 role", promote.returncode == 0)
    sadm, admin_user = login(USER_ADMIN)
    check("管理员登录 role=admin", admin_user.get("role") == "admin")

    # A 建一篇文章
    _, created = call(sa, "POST", "/api/posts", 201, json={
        "title": f"B1 删除测试 {PREFIX}",
        "content_md": "用于验证外键级联删除的文章正文。",
        "summary": "",
        "status": "published",
        "tags": [f"{PREFIX}_tag"],
        "visibility": "public",
        "cover": "",
    })
    post_id = data(created).get("id")
    check("A 创建文章", bool(post_id))

    # 1) 父评论 + 子回复，管理员删父评论应连带子回复
    _, parent = call(sb, "POST", f"/api/posts/{post_id}/comments", 201,
                     json={"content": "父评论"})
    parent_id = data(parent).get("id")
    check("B 创建父评论", bool(parent_id))
    _, reply = call(sa, "POST", f"/api/posts/{post_id}/comments", 201,
                    json={"content": "子回复", "parent_id": parent_id})
    reply_id = data(reply).get("id")
    check("A 创建子回复", bool(reply_id))

    call(sadm, "DELETE", f"/api/admin/comments/{parent_id}", 200)
    _, after_comment = call(sa, "GET", f"/api/posts/{post_id}/comments", 200)
    remaining = {c.get("id") for c in (data(after_comment).get("comments") or [])}
    check("删父评论连带删除子回复", parent_id not in remaining and reply_id not in remaining,
          f"remaining={remaining}")

    # 2) 重新造一条评论 + 点赞/收藏/关注/通知/投稿，验证删用户级联
    _, comment = call(sb, "POST", f"/api/posts/{post_id}/comments", 201,
                      json={"content": "删用户前的评论"})
    check("B 重新创建评论", bool(data(comment).get("id")))
    call(sb, "POST", f"/api/posts/{post_id}/like", 200)
    call(sb, "POST", f"/api/posts/{post_id}/bookmark", 200)
    call(sb, "POST", f"/api/users/{USER_A}/follow", 200)

    insert_video = mysql_run(
        "INSERT INTO video_submissions (uploader_id, filename, original_name, status, is_active) "
        f"VALUES ({aid}, 'b1fix_test.mp4', 'b1fix_test.mp4', 'pending', 0)")
    check("插入 A 的投稿视频记录", insert_video.returncode == 0)

    def counts():
        return {
            "users": scalar(f"SELECT COUNT(*) FROM users WHERE id={aid}"),
            "posts": scalar(f"SELECT COUNT(*) FROM posts WHERE user_id={aid}"),
            "comments": scalar(
                f"SELECT COUNT(*) FROM comments WHERE post_id IN (SELECT id FROM posts WHERE user_id={aid})"),
            "likes": scalar(
                f"SELECT COUNT(*) FROM post_likes WHERE user_id={aid} OR post_id IN (SELECT id FROM posts WHERE user_id={aid})"),
            "bookmarks": scalar(
                f"SELECT COUNT(*) FROM post_bookmarks WHERE user_id={aid} OR post_id IN (SELECT id FROM posts WHERE user_id={aid})"),
            "follows": scalar(f"SELECT COUNT(*) FROM follows WHERE follower_id={aid} OR followee_id={aid}"),
            "notifications": scalar(
                f"SELECT COUNT(*) FROM notifications WHERE user_id={aid} OR actor_name='{USER_A}'"),
            "videos": scalar(f"SELECT COUNT(*) FROM video_submissions WHERE uploader_id={aid}"),
        }

    before = counts()
    check("删用户前关联数据齐全", all(v > 0 for k, v in before.items() if k != "users"),
          f"before={before}")

    call(sadm, "DELETE", f"/api/admin/users/{aid}", 200)
    after = counts()
    check("删用户后账号消失", after["users"] == 0)
    check("删用户后文章级联", after["posts"] == 0)
    check("删用户后评论级联", after["comments"] == 0)
    check("删用户后点赞级联", after["likes"] == 0)
    check("删用户后收藏级联", after["bookmarks"] == 0)
    check("删用户后关注级联", after["follows"] == 0)
    check("删用户后通知级联", after["notifications"] == 0)
    check("删用户后投稿视频级联", after["videos"] == 0)
    check("其他用户仍存在", scalar(f"SELECT COUNT(*) FROM users WHERE id={bid}") == 1)


if __name__ == "__main__":
    try:
        main()
    finally:
        # 清理测试账号；外键已修好，直接删 users 就能级联，但保留显式顺序更稳
        try:
            cleanup_sql = f"""
SET FOREIGN_KEY_CHECKS=0;
DELETE FROM comments WHERE post_id IN (SELECT id FROM posts WHERE user_id IN (SELECT id FROM users WHERE username LIKE '{PREFIX}%'));
DELETE FROM post_tags WHERE post_id IN (SELECT id FROM posts WHERE user_id IN (SELECT id FROM users WHERE username LIKE '{PREFIX}%'));
DELETE FROM post_likes WHERE user_id IN (SELECT id FROM users WHERE username LIKE '{PREFIX}%') OR post_id IN (SELECT id FROM posts WHERE user_id IN (SELECT id FROM users WHERE username LIKE '{PREFIX}%'));
DELETE FROM post_bookmarks WHERE user_id IN (SELECT id FROM users WHERE username LIKE '{PREFIX}%') OR post_id IN (SELECT id FROM posts WHERE user_id IN (SELECT id FROM users WHERE username LIKE '{PREFIX}%'));
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