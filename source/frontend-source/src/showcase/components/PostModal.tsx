/* PostModal.tsx — 站内阅读弹窗（点场景 2 的卡片打开）
 *
 * 存在的理由：用户要「不跳转到博客，在这个页面直接展示」。所以点文章不是
 * navigate 到 /post/:id，而是在 showcase 内弹开一篇来读。
 *
 * ⚠️ 必须 portal 到 Showcase 的第二个 `.ssp-scope`（`ssp-portal-root`）：
 *   挂 `.content-track` 里会被它的 transform 把 fixed 变成相对定位，
 *   挂 document.body 会脱离 `.ssp-scope` 丢掉全部样式 —— 与 ProjectModal 同一个约束。
 *
 * 正文策略与原 `pages/Post.tsx` 一致：优先 `content_html`（后端 cmark 渲染的完整 HTML），
 * 没有则退回本地 `renderMarkdown`（场景 3 编辑器用的同一套，保证预览与成稿一致）。
 *
 * 2026-09-21 起内嵌互动区（替代被删除的文章详情页）：
 *   · 点赞 / 收藏 —— 登录用户可切换，未登录提示并跳登录
 *   · 评论区 —— 列表 + 发表（发表需登录），实时更新计数
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  X, Eye, Heart, Bookmark, MessageSquare, Loader2, Send, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { postsApi, commentsApi, type ApiComment, type ApiPost } from "../../lib/api";
import { useAuth } from "../../components/auth/AuthProvider";
import { renderMarkdown } from "../lib/markdown";

interface PostModalProps {
  post: ApiPost | null;
  onClose: () => void;
}

/** 打开 320ms / 关闭 260ms：rendered 决定在不在 DOM，opened 决定 is-open 类 */
const CLOSE_MS = 260;

const PostModal = ({ post, onClose }: PostModalProps) => {
  const navigate = useNavigate();
  const { isLoggedIn, user } = useAuth();
  const [rendered, setRendered] = useState(false);
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    if (post) {
      setRendered(true);
      const id = requestAnimationFrame(() => setOpened(true));
      return () => cancelAnimationFrame(id);
    }
    setOpened(false);
    const id = setTimeout(() => setRendered(false), CLOSE_MS);
    return () => clearTimeout(id);
  }, [post]);

  /* Esc 关闭。场景导航的 keydown 只认方向键 / Home / Enter，不会抢。 */
  useEffect(() => {
    if (!post) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [post, onClose]);

  /* ⚠️ 列表接口（/api/posts）**不带正文** —— 只有 title / excerpt / 计数。
     所以弹窗必须自己拉一次详情，否则正文区是空的（实测踩到过：卡片标题正常、
     弹窗里 0 字）。失败时退回列表里那份（至少有标题摘要，不至于白屏）。
     详情接口带 `liked` / `bookmarked` 字段（当前用户是否已赞/已收藏）。 */
  const [detail, setDetail] = useState<ApiPost | null>(null);
  const [loadingBody, setLoadingBody] = useState(false);

  /* 点赞 / 收藏 / 评论状态（弹窗打开或登录态变化时重置） */
  const [liked, setLiked] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  const [comments, setComments] = useState<ApiComment[]>([]);
  const [commentsTotal, setCommentsTotal] = useState(0);
  const [loadingComments, setLoadingComments] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    if (!post) {
      setDetail(null);
      setComments([]);
      setCommentText("");
      return;
    }
    let alive = true;
    setLoadingBody(true);
    postsApi
      .get(post.id)
      .then((full) => {
        if (!alive) return;
        setDetail(full);
        setLiked(!!full.liked);
        setBookmarked(!!full.bookmarked);
      })
      .catch(() => {
        if (alive) setDetail(post);
      })
      .finally(() => {
        if (alive) setLoadingBody(false);
      });

    setLoadingComments(true);
    commentsApi
      .list(post.id, 1, 50)
      .then((res) => {
        if (!alive) return;
        setComments(res.comments);
        setCommentsTotal(res.total);
      })
      .catch(() => {
        if (!alive) return;
        setComments([]);
        setCommentsTotal(0);
      })
      .finally(() => {
        if (alive) setLoadingComments(false);
      });

    return () => {
      alive = false;
    };
  }, [post, isLoggedIn]);

  const p = detail ?? post;

  const body = useMemo(() => {
    if (!p) return null;
    const md = p.content_md ?? p.content ?? "";
    return renderMarkdown(md);
  }, [p]);

  /** 未登录点互动：提示 + 去登录。
   *  带上文章 id —— 登录成功后 Login.tsx 会跳回 /showcase 并把 state 原样传回，
   *  Showcase 读到 reopenPost 自动重开这篇的弹窗（用户可以直接继续评论）。 */
  const requireLogin = () => {
    if (!p) return;
    toast.error("请先登录");
    onClose();
    navigate("/login", { state: { reopenPost: p.id } });
  };

  const toggleLike = async () => {
    if (!p) return;
    if (!isLoggedIn) return requireLogin();
    if (likeBusy) return;
    setLikeBusy(true);
    const next = !liked;
    // 乐观更新，失败回滚
    setLiked(next);
    setDetail((prev) => (prev ? { ...prev, likes: (prev.likes ?? 0) + (next ? 1 : -1) } : prev));
    try {
      await (next ? postsApi.like(p.id) : postsApi.unlike(p.id));
    } catch {
      setLiked(!next);
      setDetail((prev) => (prev ? { ...prev, likes: (prev.likes ?? 0) + (next ? -1 : 1) } : prev));
      toast.error("操作失败");
    } finally {
      setLikeBusy(false);
    }
  };

  const toggleBookmark = async () => {
    if (!p) return;
    if (!isLoggedIn) return requireLogin();
    const next = !bookmarked;
    setBookmarked(next);
    try {
      await (next ? postsApi.bookmark(p.id) : postsApi.unbookmark(p.id));
      toast.success(next ? "已收藏" : "已取消收藏");
    } catch {
      setBookmarked(!next);
      toast.error("操作失败");
    }
  };

  const submitComment = async () => {
    if (!p) return;
    if (!isLoggedIn) return requireLogin();
    const text = commentText.trim();
    if (!text) return;
    setPosting(true);
    try {
      const created = await commentsApi.create(p.id, text);
      setComments((prev) => [...prev, created]);
      setCommentsTotal((total) => total + 1);
      setCommentText("");
      setDetail((prev) => (prev ? { ...prev, comments_count: (prev.comments_count ?? 0) + 1 } : prev));
    } catch {
      toast.error("评论发表失败");
    } finally {
      setPosting(false);
    }
  };

  /** B5：评论分页 —— 首屏 50 条，剩余走“加载更多” */
  const loadMoreComments = async () => {
    if (!p || loadingMore) return;
    setLoadingMore(true);
    try {
      const nextPage = Math.floor(comments.length / 50) + 1;
      const res = await commentsApi.list(p.id, nextPage, 50);
      setComments((prev) => [...prev, ...res.comments]);
      setCommentsTotal(res.total);
    } catch {
      toast.error("加载更多评论失败");
    } finally {
      setLoadingMore(false);
    }
  };

  const canDeleteComment = (c: ApiComment) =>
    !!user && (user.role === "admin" || c.author_name === user.username);

  const deleteComment = async (c: ApiComment) => {
    if (!p) return;
    if (!window.confirm("确定删除这条评论吗？其下的回复会一并删除。")) return;
    try {
      await commentsApi.remove(c.id);
      setComments((prev) => prev.filter((item) => item.id !== c.id));
      setCommentsTotal((total) => Math.max(0, total - 1));
      setDetail((prev) => (prev
        ? { ...prev, comments_count: Math.max(0, (prev.comments_count ?? 0) - 1) }
        : prev));
      toast.success("评论已删除");
    } catch {
      toast.error("删除失败");
    }
  };

  /** B5：后端早就支持 parent_id（回复），但列表原来把回复按时间平铺，
   *  回复看着和顶级评论同级、还看不出它在回谁。这里只做展示归位，
   *  「回复」入口本身仍是清单第十节的待拍板项，没在这轮加。 */
  const commentTree = useMemo(() => {
    const children = new Map<number, ApiComment[]>();
    const tops: ApiComment[] = [];
    for (const c of comments) {
      if (c.parent_id) {
        const list = children.get(c.parent_id) ?? [];
        list.push(c);
        children.set(c.parent_id, list);
      } else {
        tops.push(c);
      }
    }
    // 父评论已被删除（级联删库后不该出现，防御性归位到顶层，避免回复凭空消失）
    const orphan = [...children.keys()].filter((id) => !comments.some((c) => c.id === id));
    for (const id of orphan) {
      for (const c of children.get(id) ?? []) tops.push(c);
      children.delete(id);
    }
    return { tops, children };
  }, [comments]);

  const renderComment = (c: ApiComment, isReply: boolean) => (
    <li key={c.id} className={"post-modal-comment" + (isReply ? " is-reply" : "")}>
      <div className="post-modal-comment-head">
        <span className="post-modal-comment-author">
          {(c.author_name ?? c.author ?? "匿名").charAt(0).toUpperCase()}
          {(c.author_name ?? c.author ?? "匿名").slice(1)}
        </span>
        <span className="post-modal-comment-time">
          {(c.created_at ?? "").slice(0, 16).replace("T", " ")}
          {canDeleteComment(c) && (
            <button
              type="button"
              className="post-modal-comment-delete"
              title="删除评论"
              aria-label="删除评论"
              onClick={() => deleteComment(c)}
            >
              <Trash2 size={11} />
            </button>
          )}
        </span>
      </div>
      <p className="post-modal-comment-body">{c.content}</p>
    </li>
  );

  if (!rendered) return null;

  const date = p?.created_at ? p.created_at.slice(0, 10) : "";

  return (
    <div
      className={"post-modal-overlay" + (opened ? " is-open" : "")}
      role="dialog"
      aria-modal="true"
      aria-label={p ? `文章：${p.title}` : "文章"}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onWheel={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
    >
      <div className="post-modal-card">
        <div className="post-modal-head">
          <div className="post-modal-head-text">
            <p className="post-modal-meta">
              {p?.author ?? "匿名"}
              {date ? ` · ${date}` : ""}
              {p?.views ? ` · ${p.views} 次阅读` : ""}
            </p>
            <h3 className="post-modal-title">{p?.title}</h3>
          </div>
          <button type="button" className="post-modal-close" aria-label="关闭" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="post-modal-body">
          {p?.cover && <img className="post-modal-cover" src={p.cover} alt="" />}
          {loadingBody ? (
            <p className="post-modal-loading">正文加载中…</p>
          ) : p?.content_html ? (
            <div className="post-modal-html md-body" dangerouslySetInnerHTML={{ __html: p.content_html }} />
          ) : (
            <div className="md-body">{body}</div>
          )}
        </div>

        {/* ---------- 互动区：点赞 / 收藏 / 评论数 ---------- */}
        <div className="post-modal-engage">
          <button
            type="button"
            className={"post-modal-act" + (liked ? " is-on" : "")}
            onClick={toggleLike}
            disabled={likeBusy}
            title={isLoggedIn ? (liked ? "取消点赞" : "点赞") : "登录后可点赞"}
          >
            <Heart size={15} /> {p?.likes ?? 0}
          </button>
          <button
            type="button"
            className={"post-modal-act" + (bookmarked ? " is-on is-mark" : "")}
            onClick={toggleBookmark}
            title={isLoggedIn ? (bookmarked ? "取消收藏" : "收藏") : "登录后可收藏"}
          >
            <Bookmark size={15} /> {bookmarked ? "已收藏" : "收藏"}
          </button>
          <span className="post-modal-act is-static">
            <MessageSquare size={15} /> {p?.comments_count ?? comments.length}
          </span>
        </div>

        {/* ---------- 评论区 ---------- */}
        <div className="post-modal-comments">
          <h4 className="post-modal-comments-title">评论（{commentsTotal || comments.length}）</h4>

          {isLoggedIn ? (
            <div className="post-modal-comment-form">
              <div className="post-modal-comment-inputwrap">
                <textarea
                  className="post-modal-comment-input"
                  rows={2}
                  maxLength={1000}
                  placeholder={`以 ${user?.username} 的身份发表评论…`}
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submitComment();
                  }}
                />
                <button
                  type="button"
                  className="post-modal-comment-send"
                  onClick={submitComment}
                  disabled={posting || !commentText.trim()}
                >
                  {posting ? <Loader2 size={13} className="post-modal-spin" /> : <Send size={13} />}
                  发表
                </button>
              </div>
            </div>
          ) : (
            <p className="post-modal-comment-login">
              <button type="button" onClick={requireLogin}>登录</button>
              后即可发表评论
            </p>
          )}

          {loadingComments ? (
            <p className="post-modal-comment-empty">评论加载中…</p>
          ) : comments.length === 0 ? (
            <p className="post-modal-comment-empty">还没有评论，来抢沙发</p>
          ) : (
            <ul className="post-modal-comment-list">
              {commentTree.tops.map((c) => (
                <li key={c.id} className="post-modal-comment-node">
                  {renderComment(c, false)}
                  {(commentTree.children.get(c.id)?.length ?? 0) > 0 && (
                    <ul className="post-modal-comment-children">
                      {commentTree.children.get(c.id)!.map((child) => renderComment(child, true))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}

          {!loadingComments && comments.length < commentsTotal && (
            <button
              type="button"
              className="post-modal-comment-more"
              onClick={loadMoreComments}
              disabled={loadingMore}
            >
              {loadingMore ? "加载中…" : `加载更多（还有 ${commentsTotal - comments.length} 条）`}
            </button>
          )}
        </div>

        <div className="post-modal-foot">
          <span className="post-modal-stats">
            {typeof p?.views === "number" && (
              <span className="post-modal-stat">
                <Eye size={13} /> {p.views}
              </span>
            )}
          </span>
          <span className="post-modal-actions">
            <button type="button" className="post-modal-btn" onClick={onClose}>
              关闭
            </button>
          </span>
        </div>
      </div>
    </div>
  );
};

export default PostModal;
