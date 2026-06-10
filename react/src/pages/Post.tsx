import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Heart, MessageCircle, Bookmark, Share2, ArrowLeft,
  Eye, Clock, ThumbsUp, Send, MoreHorizontal, Copy, Twitter, Link
} from "lucide-react";
import GlassBackground from "../components/GlassBackground";
import Navbar from "../components/Navbar";
import { toast } from "sonner";
import { commentsApi, postsApi, type ApiComment, type ApiPost } from "../lib/api";

// @cuiruoni+文章详情页组件：阅读进度条+侧边操作栏+目录导航+评论系统，三栏布局
const Post = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [liked, setLiked] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  // @cuiruoni+阅读进度：基于文章内容区域的滚动位置计算百分比
  const [progress, setProgress] = useState(0);
  const [commentText, setCommentText] = useState(``);
  const [showShare, setShowShare] = useState(false);
  const [post, setPost] = useState<ApiPost | null>(null);
  const [comments, setComments] = useState<ApiComment[]>([]);
  const [loading, setLoading] = useState(true);
  const contentRef = useRef<HTMLDivElement>(null);
  const [isLoggedIn] = useState(() => !!localStorage.getItem(`blog_logged_in`));
  const postId = Number(searchParams.get(`id`) ?? 1);

  // @cuiruoni+从localStorage恢复点赞/收藏状态
  useEffect(() => {
    try {
      const likedPosts = JSON.parse(localStorage.getItem(`blog_liked_posts`) || `[]`);
      const bookmarkedPosts = JSON.parse(localStorage.getItem(`blog_bookmarked_posts`) || `[]`);
      setLiked(likedPosts.includes(postId));
      setBookmarked(bookmarkedPosts.includes(postId));
    } catch { /* ignore */ }
  }, [postId]);

  const toggleLike = () => {
    const next = !liked;
    setLiked(next);
    try {
      const arr: number[] = JSON.parse(localStorage.getItem(`blog_liked_posts`) || `[]`);
      if (next) { if (!arr.includes(postId)) arr.push(postId); }
      else { const idx = arr.indexOf(postId); if (idx >= 0) arr.splice(idx, 1); }
      localStorage.setItem(`blog_liked_posts`, JSON.stringify(arr));
    } catch { /* ignore */ }
  };

  const toggleBookmark = () => {
    const next = !bookmarked;
    setBookmarked(next);
    try {
      const arr: number[] = JSON.parse(localStorage.getItem(`blog_bookmarked_posts`) || `[]`);
      if (next) { if (!arr.includes(postId)) arr.push(postId); }
      else { const idx = arr.indexOf(postId); if (idx >= 0) arr.splice(idx, 1); }
      localStorage.setItem(`blog_bookmarked_posts`, JSON.stringify(arr));
    } catch { /* ignore */ }
  };

  // @cuiruoni+滚动监听计算阅读进度：被动监听优化性能，卸载时移除监听
  useEffect(() => {
    const handleScroll = () => {
      const el = contentRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const total = el.offsetHeight;
      const scrolled = Math.max(0, -rect.top);
      const pct = Math.min(100, (scrolled / total) * 100);
      setProgress(pct);
    };
    window.addEventListener(`scroll`, handleScroll, { passive: true });
    return () => window.removeEventListener(`scroll`, handleScroll);
  }, []);

  useEffect(() => {
    const loadPost = async () => {
      setLoading(true);
      const [postData, commentData] = await Promise.all([
        postsApi.get(postId),
        commentsApi.list(postId),
      ]);
      setPost(postData);
      setComments(commentData);
      setLoading(false);
    };
    loadPost();
  }, [postId]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    toast.success(`链接已复制！`);
    setShowShare(false);
  };

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    const created = await commentsApi.create(postId, commentText.trim());
    if (!created) {
      toast.error(`评论发布失败，请稍后重试`);
      return;
    }
    setComments((prev) => [...prev, created]);
    setCommentText(``);
    toast.success(`评论发布成功！`);
  };

  const handleLogout = () => {
    localStorage.removeItem(`blog_logged_in`);
    navigate(`/login`);
  };

  const articleTitle = post?.title ?? `加载中...`;
  const articleContent = post?.content_html ?? post?.content_md ?? ``;

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
      <GlassBackground showParticles={false} />
      <Navbar isLoggedIn={isLoggedIn} onLogout={handleLogout} onLogin={() => navigate(`/login`)} />

      {/* Reading progress bar */}
      <div className="reading-progress-bar" style={{ width: `${progress}%` }} />

      <div className="relative z-10" style={{ paddingTop: 64 }}>
        <div className="mx-auto px-6 py-8" style={{ maxWidth: 1440 }}>
          <div className="flex gap-8">
            {/* Left: article action sidebar */}
            <div className="hidden xl:flex flex-col items-center gap-4 flex-shrink-0 pt-10" style={{ width: 60 }}>
              <div className="sticky flex flex-col items-center gap-4" style={{ top: 100 }}>
                <button
                  onClick={() => toggleLike()}
                  className="flex flex-col items-center gap-1 group"
                >
                  <div
                    className="w-11 h-11 rounded-2xl flex items-center justify-center transition-all"
                    style={{
                      background: liked ? `rgba(244,114,182,0.2)` : `rgba(255,255,255,0.05)`,
                      border: `1px solid ${liked ? `rgba(244,114,182,0.4)` : `rgba(255,255,255,0.08)`}`,
                    }}
                  >
                    <Heart size={18} style={{ color: liked ? `#f472b6` : `rgba(232,234,246,0.6)` }} fill={liked ? `#f472b6` : `none`} />
                  </div>
                  <span className="text-xs" style={{ color: `rgba(232,234,246,0.4)` }}>{liked ? 249 : 248}</span>
                </button>

                <button className="flex flex-col items-center gap-1">
                  <div
                    className="w-11 h-11 rounded-2xl flex items-center justify-center"
                    style={{ background: `rgba(255,255,255,0.05)`, border: `1px solid rgba(255,255,255,0.08)` }}
                  >
                    <MessageCircle size={18} style={{ color: `rgba(232,234,246,0.6)` }} />
                  </div>
                  <span className="text-xs" style={{ color: `rgba(232,234,246,0.4)` }}>{displayComments.length}</span>
                </button>

                <button
                  onClick={() => toggleBookmark()}
                  className="flex flex-col items-center gap-1"
                >
                  <div
                    className="w-11 h-11 rounded-2xl flex items-center justify-center transition-all"
                    style={{
                      background: bookmarked ? `rgba(124,106,255,0.2)` : `rgba(255,255,255,0.05)`,
                      border: `1px solid ${bookmarked ? `rgba(124,106,255,0.4)` : `rgba(255,255,255,0.08)`}`,
                    }}
                  >
                    <Bookmark size={18} style={{ color: bookmarked ? `#a78bfa` : `rgba(232,234,246,0.6)` }} fill={bookmarked ? `#a78bfa` : `none`} />
                  </div>
                </button>

                <div className="relative">
                  <button
                    onClick={() => setShowShare(!showShare)}
                    className="flex flex-col items-center gap-1"
                  >
                    <div
                      className="w-11 h-11 rounded-2xl flex items-center justify-center"
                      style={{ background: `rgba(255,255,255,0.05)`, border: `1px solid rgba(255,255,255,0.08)` }}
                    >
                      <Share2 size={18} style={{ color: `rgba(232,234,246,0.6)` }} />
                    </div>
                  </button>
                  <div
                    className="absolute left-14 top-0 w-44 glass rounded-xl overflow-hidden"
                    style={{
                      opacity: showShare ? 1 : 0,
                      pointerEvents: showShare ? `auto` : `none`,
                      transition: `all 0.2s`,
                      zIndex: 50,
                    }}
                  >
                    <button onClick={handleCopyLink} className="w-full flex items-center gap-2 px-4 py-3 text-sm text-foreground hover:bg-white/5">
                      <Copy size={14} /> 复制链接
                    </button>
                    <button onClick={() => setShowShare(false)} className="w-full flex items-center gap-2 px-4 py-3 text-sm text-foreground hover:bg-white/5">
                      <Twitter size={14} style={{ color: `#38bdf8` }} /> 分享至 Twitter
                    </button>
                  </div>
                  <div
                    className="fixed inset-0"
                    style={{ zIndex: -1, pointerEvents: showShare ? `auto` : `none` }}
                    onClick={() => setShowShare(false)}
                  />
                </div>
              </div>
            </div>

            {/* Main content */}
            <div className="flex-1 min-w-0">
              {/* Back btn */}
              <button
                onClick={() => navigate(`/`)}
                className="flex items-center gap-2 text-sm mb-6 transition-colors"
                style={{ color: `rgba(232,234,246,0.5)` }}
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
                  {loading ? `加载中...` : articleTitle}
                </h1>

                <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center font-bold"
                      style={{ background: `linear-gradient(135deg, #7c6aff, #f472b6)` }}
                    >
                      {(post?.author || `匿名`).slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-semibold text-sm text-foreground">{post?.author || `匿名用户`}</div>
                      <div className="text-xs" style={{ color: `rgba(232,234,246,0.4)` }}>{articleDate}</div>
                    </div>
                    <button
                      className="px-3 py-1 rounded-full text-xs font-medium transition-all"
                      style={{
                        background: `rgba(124,106,255,0.12)`,
                        border: `1px solid rgba(124,106,255,0.25)`,
                        color: `#a78bfa`,
                      }}
                    >
                      + 关注
                    </button>
                  </div>

                  <div className="flex items-center gap-4 text-xs" style={{ color: `rgba(232,234,246,0.4)` }}>
                    <span className="flex items-center gap-1"><Clock size={12} />8 min read</span>
                    <span className="flex items-center gap-1"><Eye size={12} />{articleViews.toLocaleString()} 阅读</span>
                    <button className="btn-ghost-glass p-2 rounded-xl">
                      <MoreHorizontal size={14} />
                    </button>
                  </div>
                </div>

                {/* Cover image */}
                <div className="rounded-2xl overflow-hidden" style={{ height: 380 }}>
                  <img
                    src={post?.cover ?? `https://picsum.photos/seed/blog${postId}/1200/500`}
                    alt="封面"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>

              {/* Article content */}
              <div ref={contentRef} className="glass-card p-8 mb-8">
                <div className="prose max-w-none">
                  {loading ? (
                    <div className="text-center py-12" style={{ color: `rgba(232,234,246,0.4)` }}>
                      加载中...
                    </div>
                  ) : articleContent ? (
                    <div
                      className="article-content"
                      dangerouslySetInnerHTML={{ __html: articleContentWithIds }}
                    />
                  ) : (
                    <div className="text-center py-12" style={{ color: `rgba(232,234,246,0.4)` }}>
                      文章内容为空
                    </div>
                  )}
                </div>
              </div>

              {/* Mobile actions */}
              <div className="xl:hidden flex items-center justify-around glass-card p-4 mb-8">
                <button
                  onClick={() => toggleLike()}
                  className="flex items-center gap-2 text-sm"
                  style={{ color: liked ? `#f472b6` : `rgba(232,234,246,0.6)` }}
                >
                  <Heart size={18} fill={liked ? `#f472b6` : `none`} />
                  {liked ? 249 : 248}
                </button>
                <button className="flex items-center gap-2 text-sm" style={{ color: `rgba(232,234,246,0.6)` }}>
                  <MessageCircle size={18} />{displayComments.length}
                </button>
                <button
                  onClick={() => toggleBookmark()}
                  className="flex items-center gap-2 text-sm"
                  style={{ color: bookmarked ? `#a78bfa` : `rgba(232,234,246,0.6)` }}
                >
                  <Bookmark size={18} fill={bookmarked ? `#a78bfa` : `none`} />
                </button>
                <button className="flex items-center gap-2 text-sm" style={{ color: `rgba(232,234,246,0.6)` }}>
                  <Share2 size={18} />
                </button>
              </div>

              {/* Comments section */}
              <div className="glass-card p-6">
                <h3 className="text-lg font-bold text-foreground mb-6 flex items-center gap-2">
                  <MessageCircle size={20} style={{ color: `#7c6aff` }} />
                  评论 ({displayComments.length})
                </h3>

                {/* Comment input */}
                <form onSubmit={handleComment} className="mb-8">
                  <div className="flex gap-3">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-xs font-bold"
                      style={{ background: `linear-gradient(135deg, #7c6aff, #38bdf8)` }}
                    >
                      Me
                    </div>
                    <div className="flex-1">
                      <textarea
                        placeholder="发表你的评论..."
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        rows={3}
                        className="glass-input w-full px-4 py-3 rounded-xl text-sm resize-none"
                        style={{ minHeight: 80 }}
                      />
                      <div className="flex justify-end mt-2">
                        <button
                          type="submit"
                          disabled={!commentText.trim()}
                          className="btn-primary-glass flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium"
                          style={{ opacity: commentText.trim() ? 1 : 0.5 }}
                        >
                          <Send size={14} />
                          发布评论
                        </button>
                      </div>
                    </div>
                  </div>
                </form>

                {/* Comments list */}
                <div className="flex flex-col gap-6">
                  {displayComments.map((comment) => (
                    <div key={comment.id}>
                      <div className="flex gap-3">
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-xs font-bold"
                          style={{ background: `linear-gradient(135deg, #38bdf8, #7c6aff)` }}
                        >
                          {comment.avatar}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-semibold text-foreground">{comment.author}</span>
                            <span className="text-xs" style={{ color: `rgba(232,234,246,0.35)` }}>{comment.time}</span>
                          </div>
                          <p className="text-sm leading-relaxed mb-2" style={{ color: `rgba(232,234,246,0.75)` }}>
                            {comment.content}
                          </p>
                          <button
                            className="flex items-center gap-1.5 text-xs transition-colors"
                            style={{ color: `rgba(232,234,246,0.4)` }}
                          >
                            <ThumbsUp size={12} />
                            {comment.likes}
                            <span className="ml-2">回复</span>
                          </button>

                          {/* Replies */}
                          <div className="mt-4 ml-4 flex flex-col gap-4">
                            {comment.replies.map((reply) => (
                              <div key={reply.id} className="flex gap-3">
                                <div
                                  className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold"
                                  style={{ background: `linear-gradient(135deg, #7c6aff, #f472b6)` }}
                                >
                                  {reply.avatar}
                                </div>
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-sm font-semibold text-foreground">{reply.author}</span>
                                    <span className="text-xs" style={{ color: `rgba(232,234,246,0.35)` }}>{reply.time}</span>
                                    <span
                                      className="text-xs px-2 py-0.5 rounded-full"
                                      style={{ background: `rgba(124,106,255,0.1)`, color: `#a78bfa` }}
                                    >
                                      作者
                                    </span>
                                  </div>
                                  <p className="text-sm leading-relaxed" style={{ color: `rgba(232,234,246,0.7)` }}>
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
            <div className="hidden xl:block flex-shrink-0" style={{ width: 220 }}>
              <div className="sticky" style={{ top: 88 }}>
                <div className="glass-card p-5">
                  <div className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                    <Link size={14} style={{ color: `#7c6aff` }} />
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
                        className="text-left text-xs py-1.5 px-3 rounded-lg transition-colors hover:bg-white/5"
                        style={{
                          paddingLeft: item.level === 3 ? `1.5rem` : `0.75rem`,
                          color: i === 0 ? `#a78bfa` : `rgba(232,234,246,0.55)`,
                          borderLeft: i === 0 ? `2px solid #7c6aff` : `2px solid transparent`,
                        }}
                      >
                        {item.title}
                      </button>
                    )) : (
                      <span className="text-xs" style={{ color: `rgba(232,234,246,0.35)` }}>暂无目录</span>
                    )}
                  </div>
                </div>

                {/* Related posts */}
                <div className="glass-card p-5 mt-4">
                  <div className="text-sm font-semibold text-foreground mb-4">相关推荐</div>
                  {[
                    { title: `CSS 液态玻璃效果完全指南`, views: `8.9K` },
                    { title: `TypeScript 5.0 类型体操`, views: `4.2K` },
                  ].map((item, i) => (
                    <div
                      key={i}
                      onClick={() => navigate(`/post`)}
                      className="flex items-start gap-2 py-2.5 cursor-pointer group"
                    >
                      <span className="text-xs font-black flex-shrink-0 mt-0.5" style={{ color: `#7c6aff` }}>
                        {String(i + 1).padStart(2, `0`)}
                      </span>
                      <div>
                        <p className="text-xs leading-snug group-hover:text-purple-300 transition-colors" style={{ color: `rgba(232,234,246,0.75)` }}>
                          {item.title}
                        </p>
                        <span className="text-xs mt-0.5" style={{ color: `rgba(232,234,246,0.35)` }}>
                          {item.views} 阅读
                        </span>
                      </div>
                    </div>
                  ))}
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
