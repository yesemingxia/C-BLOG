#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
B1 残留（图片回收）的 SQL 层验证 —— 不打 HTTP，只打真实 MySQL。

为什么单独有这一支：回收图片会真的删磁盘文件，属不可逆操作。
「这张图还有没有人用」这个问题由 post_dao::count_image_references 一条 SQL 回答，
它错了就是「别人页面上的图永久 404」。接口回归需要重启后端（会打断正在跑的联调），
而这条 SQL 可以在不碰 8089 的前提下直接对真实库证明自己对。

脚本里的 count SQL 与 src/dao/post_dao.cpp 的字符串逐字一致（含 ESCAPE 写法），
改动 DAO 时必须同步改这里，否则这支脚本就失去意义。

用法：python tests/media_reclaim_sql_check.py     （需要本机 MySQL + config/config.json）
"""
import json
import os
import shutil
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_PATH = os.path.join(ROOT, "config", "config.json")
MYSQL = shutil.which("mysql") or r"C:\Program Files\MySQL\MySQL Server 9.3\bin\mysql.exe"

PREFIX = f"imgprobe_{int(time.time())}"
U1 = f"{PREFIX}_u1"
U2 = f"{PREFIX}_u2"

checks, failures = [], []


def check(name, ok, detail=""):
    checks.append((name, bool(ok)))
    print(("PASS  " if ok else "FAIL  ") + name + ("" if ok else f"  {detail}"))


def mysql_run(sql, database=True):
    cfg = json.load(open(CONFIG_PATH, encoding="utf-8"))
    env = os.environ.copy()
    env["MYSQL_PWD"] = cfg["db_password"]
    args = [MYSQL, "-h", "127.0.0.1", "-P", "3306", "-u", cfg["db_user"], "-N", "-B", "-e", sql]
    if database:
        args.insert(-2, cfg["db_name"])
    return subprocess.run(args, env=env, capture_output=True, text=True, timeout=30)


def scalar(sql):
    """跑一条只返回一个值的 SQL，拿 int；失败返回 None（不当 0 用，避免假绿）"""
    res = mysql_run(sql)
    if res.returncode != 0:
        print(f"  mysql error: {res.stderr.strip()[:300]}")
        return None
    out = res.stdout.strip()
    try:
        return int(out.split()[0])
    except Exception:
        print(f"  unparsable output: {out!r}")
        return None


# @cuiruoni+与 src/dao/post_dao.cpp::count_image_references 完全相同的查询文本。
# @cuiruoni+C++ 里的 ESCAPE '\\\\' 到 SQL 里就是 ESCAPE '\\'，服务端解析成单个反斜杠；
# @cuiruoni+这里也必须写 ESCAPE '\\'，两边口径一致才算验证。
# @cuiruoni+文章侧四个字段（cover / content_md / title / summary）少一个都可能误删，见 DAO 注释。
COUNT_SQL = (
    "SELECT (SELECT COUNT(*) FROM posts "
    "        WHERE cover LIKE '{p}' ESCAPE '\\\\' OR content_md LIKE '{p}' ESCAPE '\\\\' "
    "           OR title LIKE '{p}' ESCAPE '\\\\' OR summary LIKE '{p}' ESCAPE '\\\\') + "
    "(SELECT COUNT(*) FROM comments WHERE content LIKE '{p}' ESCAPE '\\\\') + "
    "(SELECT COUNT(*) FROM users WHERE avatar LIKE '{p}' ESCAPE '\\\\')"
)


def escape_like(s):
    """与 sanitize::escape_like 同口径：\\ % _ 前面补一个反斜杠"""
    out = []
    for ch in s:
        if ch in ("\\", "%", "_"):
            out.append("\\")
        out.append(ch)
    return "".join(out)


def count_refs(name):
    return scalar(COUNT_SQL.format(p=f"%{escape_like(name)}%"))


def img(name):
    return f"/api/upload/file/{name}"


def main():
    # @cuiruoni+四个被引用的文件名 + 一个「下划线转义」对照：
    # @cuiruoni+t_x.png 与 tXx.png 只差一个字符；未转义的 LIKE 模式里 _ 是「任意单字符」，
    # @cuiruoni+于是查 t_x.png 会把 tXx.png 那行也算进去 → 明明没人用的图被判定「仍在引用」，
    # @cuiruoni+永远删不掉（方向上是安全的，但说明转义没生效）。反过来查一次更能证明生效：
    # @cuiruoni+查 tXx.png 时若 _ 未转义，会连 t_x.png 那行一起算成 2。
    n_cover = f"{PREFIX}_cover.png"
    n_shared = f"{PREFIX}_shared.png"
    n_comment = f"{PREFIX}_comment.png"
    n_avatar = f"{PREFIX}_avatar.png"
    n_under = f"{PREFIX}_t_x.png"
    n_decoy = f"{PREFIX}_tXx.png"
    n_summary = f"{PREFIX}_summary.png"

    # @cuiruoni+建两个测试用户（邮箱留空：uq_users_email 允许多个 NULL）
    setup = (
        f"INSERT INTO users (username, password_hash, salt, role) VALUES "
        f"('{U1}','x','x','user'), ('{U2}','x','x','user');"
    )
    r = mysql_run(setup)
    if r.returncode != 0:
        print(f"SETUP FAILED: {r.stderr.strip()[:400]}")
        return 2
    uid1 = scalar(f"SELECT id FROM users WHERE username='{U1}'")
    uid2 = scalar(f"SELECT id FROM users WHERE username='{U2}'")
    check("测试用户建好了", uid1 and uid2, f"uid1={uid1} uid2={uid2}")

    # @cuiruoni+u2 的头像指向 n_avatar；P1/P3 归 u1，P2/P4 归 u2
    mysql_run(f"UPDATE users SET avatar='{img(n_avatar)}' WHERE id={uid2}")

    posts_sql = (
        f"INSERT INTO posts (user_id, title, content_md, content_html, summary, cover, status, visibility) VALUES "
        # P1：封面图 + 正文内嵌一张与 P2 共用的图
        # @cuiruoni+n_comment 只出现在下面那条评论里，P1 正文不能提它，
        # @cuiruoni+否则「评论算引用 = 1」实际会是 2（文章 + 评论各一次）
        f"({uid1}, '{PREFIX}_p1', '正文里嵌 {img(n_shared)}', 'h', 's', "
        f" '{img(n_cover)}', 'published', 'public'),"
        # P2：u2 的文章，引用同一张 shared 图
        f"({uid2}, '{PREFIX}_p2', '另一篇文章也用了 {img(n_shared)}', 'h', 's', '', 'published', 'public'),"
        # P3：下划线名
        f"({uid1}, '{PREFIX}_p3', '看 {img(n_under)}', 'h', 's', '', 'published', 'public'),"
        # P4：只差一个字符的对照名（u2 的）
        f"({uid2}, '{PREFIX}_p4', '看 {img(n_decoy)}', 'h', 's', '', 'published', 'public'),"
        # P5：图片只出现在 summary 里（正文和封面都不含它）——
        # @cuiruoni+作者常「正文换图但摘要没跟着改」，DAO 不查 summary 就会把这张图判成孤儿删掉
        # @cuiruoni+列序是 (user_id, title, content_md, content_html, summary, cover, status, visibility)
        f"({uid1}, '{PREFIX}_p5', '', 'h', '{img(n_summary)}', '', 'published', 'public');"
    )
    r = mysql_run(posts_sql)
    if r.returncode != 0:
        print(f"SETUP POSTS FAILED: {r.stderr.strip()[:400]}")
        cleanup()
        return 2
    p1 = scalar(f"SELECT id FROM posts WHERE title='{PREFIX}_p1'")
    p2 = scalar(f"SELECT id FROM posts WHERE title='{PREFIX}_p2'")
    check("测试文章建好了", p1 and p2, f"p1={p1} p2={p2}")

    mysql_run(
        f"INSERT INTO comments (post_id, author_name, content, created_at) VALUES "
        f"({p2}, '{PREFIX}_bot', '我也贴了 {img(n_comment)}', NOW())"
    )

    # ── 1. 四个来源各自都要被算进引用数 ─────────────────────────────
    check("封面(cover)算引用 = 1", count_refs(n_cover) == 1, f"got {count_refs(n_cover)}")
    check("正文(content_md)算引用：两张文章共用 = 2", count_refs(n_shared) == 2, f"got {count_refs(n_shared)}")
    check("评论(content)算引用 = 1", count_refs(n_comment) == 1, f"got {count_refs(n_comment)}")
    check("头像(users.avatar)算引用 = 1", count_refs(n_avatar) == 1, f"got {count_refs(n_avatar)}")
    check("摘要(summary)也算引用 = 1（只写在摘要里的图不能删）", count_refs(n_summary) == 1,
          f"got {count_refs(n_summary)}")

    # ── 2. 下划线必须按字面量匹配（escape_like 真的生效）─────────────
    check("查 t_x.png 只命中自己 = 1（没把 tXx.png 也算进来）",
          count_refs(n_under) == 1, f"got {count_refs(n_under)}")
    check("查 tXx.png 只命中自己 = 1（没把 t_x.png 也算进来）",
          count_refs(n_decoy) == 1, f"got {count_refs(n_decoy)}")

    # ── 3. 没被引用的名字必须是 0（否则会永远删不掉）─────────────────
    check("无人引用的名字 = 0", count_refs(f"{PREFIX}_nobody.png") == 0,
          f"got {count_refs(PREFIX + '_nobody.png')}")

    # ── 4. 核心场景：删掉引用它的那一行之后，计数才归零 ───────────────
    # @cuiruoni+这正是 reclaim 的顺序契约：先删库、后判引用、最后删文件
    mysql_run(f"DELETE FROM posts WHERE id={p1}")
    check("删掉 P1 后它的封面图 = 0（可回收）", count_refs(n_cover) == 0, f"got {count_refs(n_cover)}")
    check("删掉 P1 后 shared 仍 = 1（u2 还在用，绝不能删）", count_refs(n_shared) == 1,
          f"got {count_refs(n_shared)}")

    # ── 5. list_media_texts 用到的列名必须真实存在 ────────────────────
    # @cuiruoni+DAO 里写的是 SELECT cover, content_md FROM posts WHERE id=? / user_id=?
    got = scalar(f"SELECT COUNT(*) FROM posts WHERE user_id={uid2} AND (cover<>'' OR content_md<>'')")
    check("list_media_texts 的 user_id 维度可查（u2 剩余带图文章 = 2）", got == 2, f"got {got}")
    got = scalar(f"SELECT COUNT(*) FROM posts WHERE id={p2}")
    check("list_media_texts 的 post_id 维度可查", got == 1, f"got {got}")

    # ── 6. 反向验证：把 ESCAPE 去掉，下划线对照就会串味 ───────────────
    # @cuiruoni+证明上面第 2 组断言不是「怎么改都过」的空断言
    no_escape = COUNT_SQL.replace(" ESCAPE '\\\\'", "")
    leaked = scalar(no_escape.format(p=f"%{PREFIX}_t_x.png%"))
    check("去掉 ESCAPE 后查 t_x.png 会串成 2（说明 ESCAPE 是必需的）", leaked == 2, f"got {leaked}")

    return 0 if not failures else 1


def cleanup():
    """按依赖顺序删测试数据：先评论/文章，再用户"""
    mysql_run(f"DELETE c FROM comments c JOIN posts p ON c.post_id=p.id WHERE p.title LIKE '{PREFIX}_%'")
    mysql_run(f"DELETE FROM posts WHERE title LIKE '{PREFIX}_%'")
    mysql_run(f"DELETE FROM users WHERE username IN ('{U1}','{U2}')")
    left = scalar(f"SELECT COUNT(*) FROM posts WHERE title LIKE '{PREFIX}_%'")
    print(f"CLEANUP 剩余测试文章 = {left}")


if __name__ == "__main__":
    try:
        code = main()
    finally:
        cleanup()
    print(f"\n{len(checks) - len(failures)}/{len(checks)} checks passed")
    sys.exit(code)
