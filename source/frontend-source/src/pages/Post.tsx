import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Heart, MessageCircle, Bookmark, Share2, ArrowLeft,
  Eye, Clock, ThumbsUp, Send, MoreHorizontal, Copy, Twitter, Link
} from "lucide-react";
import GlassBackground from "../components/layout/GlassBackground";
import Navbar from "../components/layout/Navbar";
import { useAuth } from "../components/auth/AuthProvider";
import { toast } from "sonner";
import { commentsApi, postsApi, type ApiComment, type ApiPost } from "../lib/api";

const Post = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { isLoggedIn, logout } = useAuth();
  const [liked, setLiked] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [progress, setProgress] = useState(0);
  const [commentText, setCommentText] = useState("");
  const [showShare, setShowShare] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const postId = Number(id ?? 1);

  const { data: post, isLoading: loadingPost } = useQuery({
    queryKey: ["post", postId],
    queryFn: () => postsApi.get(postId),
  });

  const { data: comments = [] } = useQuery({
    queryKey: ["comments", postId],
    queryFn: () => commentsApi.list(postId),
  });

  // @cuiruoni+P1修复：相关推荐改为真实数据（按共享标签匹配），替换硬编码假数据
  const { data: relatedPool = [] } = useQuery({
    queryKey: ["posts", "related-pool"],
    queryFn: () => postsApi.list(1, 12),
    enabled: !!post,
  });
  const relatedPosts = (() => {
    const myTags = post?.tags ?? [];
    const tagMatched = relatedPool
      .filter((p) => p.id !== postId)
      .filter((p) => (p.tags ?? []).some((t) => myTags.includes(t)));
    // @cuiruoni+列表接口未返回tags时退化为"最近文章"，保证侧栏始终有真实数据
    const fallback = relatedPool.filter((p) => p.id !== postId);
    return (tagMatched.length > 0 ? tagMatched : fallback).slice(0, 3);
  })();

  const commentMutation = useMutation({
    mutationFn: (content: string) => commentsApi.create(postId, content),
    onSuccess: (created) => {
      queryClient.setQueryData<ApiComment[]>(["comments", postId], (old) => [...(old ?? []), created]);
      setCommentText("");
      toast.success("评论发布成功！");
    },
    onError: () => toast.error("评论发布失败，请稍后重试"),
  });

  // @cuiruoni+P1修复：点赞/收藏改为后端持久化，状态由文章详情接口返回
  useEffect(() => {
    setLiked(!!post?.liked);
    setBookmarked(!!post?.bookmarked);
  }, [post?.liked, post?.bookmarked]);

  const likeMutation = useMutation({
    mutationFn: (next: boolean) => next ? postsApi.like(postId) : postsApi.unlike(postId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["post", postId] });
    },
  });

  const bookmarkMutation = useMutation({
    mutationFn: (next: boolean) => next ? postsApi.bookmark(postId) : postsApi.unbookmark(postId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["post", postId] });
    },
  });

  const toggleLike = () => {
    if (!isLoggedIn) {
      toast.error("请先登录");
      navigate("/login");
      return;
    }
    const next = !liked;
    setLiked(next);
    likeMutation.mutate(next, {
      onError: () => {
        setLiked(!next);
        toast.error("操作失败，请稍后重试");
      },
    });
  };

  const toggleBookmark = () => {
    if (!isLoggedIn) {
      toast.error("请先登录");
      navigate("/login");
      return;
    }
    const next = !bookmarked;
    setBookmarked(next);
    bookmarkMutation.mutate(next, {
      onError: () => {
        setBookmarked(!next);
        toast.error("操作失败，请稍后重试");
      },
    });
  };

  useEffect(() => {
    const handleScroll = () => {
      const el = contentRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const total = el.offsetHeight;
      const scrolled = Math.max(0, -rect.top);
      setProgress(Math.min(100, (scrolled / total) * 100));
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    toast.success("链接已复制！");
    setShowShare(false);
  };

  const handleComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    commentMutation.mutate(commentText.trim());
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const articleTitle = post?.title ?? "加载中...";
  const articleContent = post?.content_html ?? post?.content_md ?? "";

  // @cuiruoni+从content_html中提取标题生成目录，并给标题注入id用于锚点滚动
  const toc = (() => {
    if (!articleContent) return [];
    const headings: { level: number; title: string; id: string }[] = [];
    const regex = /<h([1-3])[^>]*>(.*?)<\/h\1>/gi;
    let match;
    while ((match = regex.exec(articleContent)) !== null) {
      const level = parseInt(match[1], 10);
      const title = match[2].replace(/<[^>]*>/g, "").trim();
      const id = `heading-${headings.length}`;
      headings.push({ level, title, id });
    }
    return headings;
  })();

  // @cuiruoni+将文章HTML中的h1-h3注入id属性，用于目录锚点跳转
  const articleContentWithIds = (() => {
    if (!articleContent || toc.length === 0) return articleContent;
    let idx = 0;
    return articleContent.replace(/<h([1-3])([^>]*)>(.*?)<\/h\1>/gi, (_match, level, attrs, content) => {
      const id = `heading-${idx++}`;
      return `<h${level}${attrs} id="${id}">${content}</h${level}>`;
    });
  })();
  const articleDate = post?.created_at?.slice(0, 10) ?? ``;
  const articleViews = post?.views ?? post?.view_count ?? 0;
  // @cuiruoni+P2修复：阅读时长按正文实际字数计算，不再硬编码"8 min read"
  const articleReadTime = Math.max(1, Math.ceil((post?.content_md ?? "").replace(/\s+/g, "").length / 500));
  // @cuiruoni+P1修复：点赞数 = 服务端计数 - 服务端已赞状态 + 本地乐观状态（避免重复计数）
  const displayLikes = (post?.like_count ?? 0) - (post?.liked ? 1 : 0) + (liked ? 1 : 0);
  const articleTags = post?.tags?.length ? post.tags : [];
  const displayComments = comments.map((comment) => ({
    id: comment.id,
    author: comment.author ?? comment.author_name ?? `匿名用户`,
    avatar: (comment.author ?? comment.author_name ?? `匿名`).slice(0, 2).toUpperCase(),
    time: comment.created_at?.slice(0, 10) ?? ``,
    content: comment.content,
    likes: 0,
    replies: [],
  }));

  return (
    <div data-cmp="Post" className="min-h-screen relative">
      <GlassBackground />
      <Navbar isLoggedIn={isLoggedIn} onLogout={handleLogout} onLogin={() => navigate(`/login`)} />

      {/* Reading progress bar */}
      <div className="reading-progress-bar" style={{ width: `${progress}%` }} />

      <div className="relative z-10 pt-16">
        <div className="mx-auto px-6 py-8 max-w-[1440px]">
          <div className="flex gap-8">
            {/* Left: article action sidebar */}
            <div className="hidden xl:flex flex-col items-center gap-4 flex-shrink-0 pt-10 w-[60px]">
              <div className="sticky flex flex-col items-center gap-4 top-[100px]">
                <button
                  onClick={() => toggleLike()}
                  className="flex flex-col items-center gap-1 group"
                >
                  <div
                    className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all border ${
                      liked
                        ? "bg-[var(--destructive-subtle)] border-[var(--destructive)]/30"
                        : "bg-[var(--muted)] border-[var(--border)]"
                    }`}
                  >
                    <Heart
                      size={18}
                      className={liked ? "text-[var(--destructive)]" : "text-[var(--muted-foreground)]"}
                      fill={liked ? "var(--destructive)" : "none"}
                    />
                  </div>
                  <span className="text-xs text-[var(--muted-foreground)]">{displayLikes}</span>
                </button>

                <button className="flex flex-col items-center gap-1">
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-[var(--muted)] border border-[var(--border)]">
                    <MessageCircle size={18} className="text-[var(--muted-foreground)]" />
                  </div>
                  <span className="text-xs text-[var(--muted-foreground)]">{displayComments.length}</span>
                </button>

                <button
                  onClick={() => toggleBookmark()}
                  className="flex flex-col items-center gap-1"
                >
                  <div
                    className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all border ${
                      bookmarked
                        ? "bg-[var(--brand-subtle)] border-[var(--border-strong)]"
                        : "bg-[var(--muted)] border-[var(--border)]"
                    }`}
                  >
                    <Bookmark
                      size={18}
                      className={bookmarked ? "text-[var(--foreground)]" : "text-[var(--muted-foreground)]"}
                      fill={bookmarked ? "var(--foreground)" : "none"}
                    />
                  </div>
                </button>

                <div className="relative">
                  <button
                    onClick={() => setShowShare(!showShare)}
                    className="flex flex-col items-center gap-1"
                  >
                    <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-[var(--muted)] border border-[var(--border)]">
                      <Share2 size={18} className="text-[var(--muted-foreground)]" />
                    </div>
                  </button>
                  <div
                    className={`absolute left-14 top-0 w-44 card overflow-hidden z-50 transition-all duration-200 ${
                      showShare
                        ? "opacity-100 pointer-events-auto"
                        : "opacity-0 pointer-events-none"
                    }`}
                  >
                    <button onClick={handleCopyLink} className="w-full flex items-center gap-2 px-4 py-3 text-sm text-[var(--foreground)] hover:bg-[var(--muted)]">
                      <Copy size={14} /> 复制链接
                    </button>
                    <button onClick={() => setShowShare(false)} className="w-full flex items-center gap-2 px-4 py-3 text-sm text-[var(--foreground)] hover:bg-[var(--muted)]">
                      <Twitter size={14} /> 分享至 Twitter
                    </button>
                  </div>
                  <div
                    className={`fixed inset-0 z-[-1] ${showShare ? "pointer-events-auto" : "pointer-events-none"}`}
                    onClick={() => setShowShare(false)}
                  />
                </div>
              </div>
            </div>

            {/* Main content */}
            <div className="flex-1 min-w-0">
              {/* Back btn */}
              <button
                onClick={() => navigate("/home")}
                className="flex items-center gap-2 text-sm mb-6 text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
              >
                <ArrowLeft size={16} />
                返回首页
              </button>

              {/* Article header */}
              <div className="mb-8">
                <div className="flex gap-2 mb-4 flex-wrap">
                  {articleTags.map((tag) => (
                    <span key={tag} className="tag-glass">{tag}</span>
                  ))}
                </div>

                <h1 className="text-3xl font-black text-foreground leading-tight mb-4">
                  {loadingPost ? "加载中..." : articleTitle}
                </h1>

                <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold bg-[var(--foreground)] text-[var(--background)]">
                      {(post?.author || `匿名`).slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-semibold text-sm text-foreground">{post?.author || `匿名用户`}</div>
                      <div className="text-xs text-[var(--muted-foreground)]">{articleDate}</div>
                    </div>
                    <button className="px-3 py-1 rounded-full text-xs font-medium transition-all bg-[var(--brand-subtle)] border border-[var(--brand-border)] text-[var(--foreground)]">
                      + 关注
                    </button>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-[var(--muted-foreground)]">
                    <span className="flex items-center gap-1"><Clock size={12} />{articleReadTime} min read</span>
                    <span className="flex items-center gap-1"><Eye size={12} />{articleViews.toLocaleString()} 阅读</span>
                    <button className="btn-ghost p-2 rounded-xl">
                      <MoreHorizontal size={14} />
                    </button>
                  </div>
                </div>

                {/* Cover image */}
                <div className="rounded-2xl overflow-hidden h-[380px]">
                  <img
                    src={post?.cover ?? `https://picsum.photos/seed/blog${postId}/1200/500`}
                    alt="封面"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>

              {/* Article content */}
              <div ref={contentRef} className="card p-8 mb-8">
                <div className="prose max-w-none">
                  {loadingPost ? (
                    <div className="text-center py-12 text-[var(--muted-foreground)]">
                      加载中...
                    </div>
                  ) : articleContent ? (
                    <div
                      className="article-content"
                      dangerouslySetInnerHTML={{ __html: articleContentWithIds }}
                    />
                  ) : (
                    <div className="text-center py-12 text-[var(--muted-foreground)]">
                      文章内容为空
                    </div>
                  )}
                </div>
              </div>

              {/* Mobile actions */}
              <div className="xl:hidden flex items-center justify-around card p-4 mb-8">
                <button
                  onClick={() => toggleLike()}
                  className={`flex items-center gap-2 text-sm ${liked ? "text-[var(--destructive)]" : "text-[var(--muted-foreground)]"}`}
                >
                  <Heart size={18} fill={liked ? "var(--destructive)" : "none"} />
                  {displayLikes}
                </button>
                <button className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
                  <MessageCircle size={18} />{displayComments.length}
                </button>
                <button
                  onClick={() => toggleBookmark()}
                  className={`flex items-center gap-2 text-sm ${bookmarked ? "text-[var(--foreground)]" : "text-[var(--muted-foreground)]"}`}
                >
                  <Bookmark size={18} fill={bookmarked ? "var(--foreground)" : "none"} />
                </button>
                <button className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
                  <Share2 size={18} />
                </button>
              </div>

              {/* Comments section */}
              <div className="card p-6">
                <h3 className="text-lg font-bold text-foreground mb-6 flex items-center gap-2">
                  <MessageCircle size={20} className="text-[var(--primary)]" />
                  评论 ({displayComments.length})
                </h3>

                {/* Comment input */}
                {isLoggedIn ? (
                  <form onSubmit={handleComment} className="mb-8">
                    <div className="flex gap-3">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-xs font-bold bg-[var(--foreground)] text-[var(--background)]">
                        Me
                      </div>
                      <div className="flex-1">
                        <textarea
                          placeholder="发表你的评论..."
                          value={commentText}
                          onChange={(e) => setCommentText(e.target.value)}
                          rows={3}
                          className="glass-input w-full px-4 py-3 rounded-xl text-sm resize-none min-h-[80px]"
                        />
                        <div className="flex justify-end mt-2">
                          <button
                            type="submit"
                            disabled={!commentText.trim()}
                            className="btn-primary flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50"
                          >
                            <Send size={14} />
                            发布评论
                          </button>
                        </div>
                      </div>
                    </div>
                  </form>
                ) : (
                  // @cuiruoni+P1修复：未登录时不再显示可提交的评论框，改为登录引导
                  <div className="mb-8 p-4 rounded-xl bg-[var(--muted)] text-center text-sm text-[var(--muted-foreground)]">
                    登录后即可发表评论
                    <button
                      onClick={() => navigate(`/login`)}
                      className="ml-2 btn-primary px-4 py-1.5 rounded-lg text-xs font-semibold"
                    >
                      去登录
                    </button>
                  </div>
                )}

                {/* Comments list */}
                <div className="flex flex-col gap-6">
                  {displayComments.map((comment) => (
                    <div key={comment.id}>
                      <div className="flex gap-3">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-xs font-bold bg-[var(--foreground)] text-[var(--background)]">
                          {comment.avatar}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-semibold text-foreground">{comment.author}</span>
                            <span className="text-xs text-[var(--muted-foreground)]">{comment.time}</span>
                          </div>
                          <p className="text-sm leading-relaxed mb-2 text-[var(--muted-foreground)]">
                            {comment.content}
                          </p>
                          <button className="flex items-center gap-1.5 text-xs transition-colors text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
                            <ThumbsUp size={12} />
                            {comment.likes}
                            <span className="ml-2">回复</span>
                          </button>

                          {/* Replies */}
                          <div className="mt-4 ml-4 flex flex-col gap-4">
                            {comment.replies.map((reply) => (
                              <div key={reply.id} className="flex gap-3">
                                <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold bg-[var(--foreground)] text-[var(--background)]">
                                  {reply.avatar}
                                </div>
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-sm font-semibold text-foreground">{reply.author}</span>
                                    <span className="text-xs text-[var(--muted-foreground)]">{reply.time}</span>
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--brand-subtle)] text-[var(--foreground)]">
                                      作者
                                    </span>
                                  </div>
                                  <p className="text-sm leading-relaxed text-[var(--muted-foreground)]">
                                    {reply.content}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                      <hr className="divider-glass mt-6" />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: TOC sidebar */}
            <div className="hidden xl:block flex-shrink-0 w-[220px]">
              <div className="sticky top-[88px]">
                <div className="card p-5">
                  <div className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                    <Link size={14} className="text-[var(--primary)]" />
                    目录
                  </div>
                  <div className="flex flex-col gap-1">
                    {toc.length > 0 ? toc.map((item, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          const el = document.getElementById(item.id);
                          if (el) el.scrollIntoView({ behavior: `smooth`, block: `start` });
                        }}
                        className={`text-left text-xs py-1.5 px-3 rounded-lg transition-colors hover:bg-[var(--muted)] ${
                          i === 0
                            ? "text-[var(--foreground)] border-l-2 border-[var(--foreground)]"
                            : "text-[var(--muted-foreground)] border-l-2 border-transparent"
                        }`}
                        style={{ paddingLeft: item.level === 3 ? `1.5rem` : `0.75rem` }}
                      >
                        {item.title}
                      </button>
                    )) : (
                      <span className="text-xs text-[var(--muted-foreground)]">暂无目录</span>
                    )}
                  </div>
                </div>

                {/* Related posts */}
                <div className="card p-5 mt-4">
                  <div className="text-sm font-semibold text-foreground mb-4">相关推荐</div>
                  {relatedPosts.length > 0 ? (
                    relatedPosts.map((item, i) => (
                      <div
                        key={item.id}
                        onClick={() => navigate(`/post/${item.id}`)}
                        className="flex items-start gap-2 py-2.5 cursor-pointer group"
                      >
                        <span className="text-xs font-black flex-shrink-0 mt-0.5 text-[var(--primary)]">
                          {String(i + 1).padStart(2, `0`)}
                        </span>
                        <div>
                          <p className="text-xs leading-snug group-hover:text-[var(--foreground)] transition-colors text-[var(--muted-foreground)]">
                            {item.title}
                          </p>
                          <span className="text-xs mt-0.5 text-[var(--muted-foreground)]">
                            {item.views ?? 0} 阅读
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <span className="text-xs text-[var(--muted-foreground)]">暂无相关文章</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Post;
