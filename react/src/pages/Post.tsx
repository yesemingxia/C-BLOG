import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Heart, MessageCircle, Bookmark, Share2, ArrowLeft,
  Eye, Clock, ThumbsUp, Send, MoreHorizontal, Copy, Twitter, Link
} from "lucide-react";
import GlassBackground from "../components/GlassBackground";
import Navbar from "../components/Navbar";
import { toast } from "sonner";

const mockContent = `
## 前言

在现代 Web 开发中，前端架构的重要性不言而喻。随着应用规模的不断扩大，如何设计一个**高性能、可维护**的前端架构体系成为了每个前端工程师必须面对的挑战。

## 核心概念

### 1. 组件化思想

React 的核心思想是组件化。每个 UI 元素都可以被抽象为一个独立的组件，组件之间通过 Props 进行通信。

\`\`\`typescript
interface ButtonProps {
  variant?: 'primary' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
  children: React.ReactNode;
}

const Button = ({ variant = 'primary', size = 'md', onClick, children }: ButtonProps) => {
  return (
    <button 
      className={\`btn btn-\${variant} btn-\${size}\`}
      onClick={onClick}
    >
      {children}
    </button>
  );
};
\`\`\`

### 2. 状态管理策略

在大型应用中，状态管理是架构设计的核心问题。我们需要根据状态的范围和生命周期来选择合适的状态管理方案：

- **本地状态**: 使用 \`useState\` 或 \`useReducer\`
- **跨组件状态**: 使用 \`Context API\` 或状态管理库
- **服务端状态**: 使用 \`@tanstack/react-query\`

### 3. 性能优化

性能优化是前端架构中不可或缺的一环。常见的优化策略包括：

1. **代码分割** - 使用动态 import 实现按需加载
2. **虚拟化** - 对长列表使用虚拟滚动
3. **Memoization** - 合理使用 \`useMemo\` 和 \`useCallback\`
4. **图片优化** - 使用 WebP 格式和懒加载

## 实战案例

在我们最近的项目重构中，我们将一个拥有 200+ 页面的单体应用成功迁移到了微前端架构。这个过程中我们总结了以下几点经验：

> "好的架构不是一开始就设计出来的，而是在不断迭代中演进出来的。"

通过合理的模块划分和边界定义，我们将应用拆分为 8 个独立的微应用，每个微应用都有自己独立的部署流程和技术栈选择空间。

## 总结

现代前端架构的设计需要在**灵活性**、**可维护性**和**性能**之间找到平衡。没有放之四海而皆准的方案，关键是根据项目的实际需求做出合适的技术决策。
`;

const comments = [
  {
    id: 1,
    author: `Luna Park`,
    avatar: `LP`,
    time: `2小时前`,
    content: `写得非常详细！特别是关于微前端架构的部分，正好是我们团队目前遇到的问题，受益匪浅。`,
    likes: 24,
    replies: [
      {
        id: 2,
        author: `Nova Chen`,
        avatar: `NC`,
        time: `1小时前`,
        content: `谢谢你的认可！如果有具体的问题欢迎继续探讨 😊`,
        likes: 8,
      },
    ],
  },
  {
    id: 3,
    author: `Kai Zhao`,
    avatar: `KZ`,
    time: `5小时前`,
    content: `状态管理那一块讲得很清晰，赞！不过我觉得 Zustand 也值得一提，在中小型项目里非常好用。`,
    likes: 15,
    replies: [],
  },
  {
    id: 4,
    author: `Mia Liu`,
    avatar: `ML`,
    time: `1天前`,
    content: `已收藏！这篇文章讲到了我之前一直没搞懂的概念，终于豁然开朗了。`,
    likes: 31,
    replies: [],
  },
];

const toc = [
  { title: `前言`, level: 2 },
  { title: `核心概念`, level: 2 },
  { title: `组件化思想`, level: 3 },
  { title: `状态管理策略`, level: 3 },
  { title: `性能优化`, level: 3 },
  { title: `实战案例`, level: 2 },
  { title: `总结`, level: 2 },
];

const Post = () => {
  const navigate = useNavigate();
  const [liked, setLiked] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [progress, setProgress] = useState(0);
  const [commentText, setCommentText] = useState(``);
  const [showShare, setShowShare] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [isLoggedIn] = useState(() => !!localStorage.getItem(`blog_logged_in`));

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

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    toast.success(`链接已复制！`);
    setShowShare(false);
  };

  const handleComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    toast.success(`评论发布成功！`);
    setCommentText(``);
  };

  const handleLogout = () => {
    localStorage.removeItem(`blog_logged_in`);
    navigate(`/login`);
  };

  // Render markdown-like content
  const renderContent = (text: string) => {
    const lines = text.split(`\n`);
    return lines.map((line, i) => {
      if (line.startsWith(`## `)) {
        return (
          <h2 key={i} className="text-2xl font-black text-foreground mt-10 mb-4" style={{ color: `#e8eaf6` }}>
            {line.slice(3)}
          </h2>
        );
      }
      if (line.startsWith(`### `)) {
        return (
          <h3 key={i} className="text-lg font-bold mt-7 mb-3" style={{ color: `#c4b5fd` }}>
            {line.slice(4)}
          </h3>
        );
      }
      if (line.startsWith(`> `)) {
        return (
          <blockquote
            key={i}
            className="my-4 pl-5 py-3 italic text-base"
            style={{
              borderLeft: `3px solid #7c6aff`,
              background: `rgba(124,106,255,0.07)`,
              color: `rgba(232,234,246,0.75)`,
              borderRadius: `0 0.75rem 0.75rem 0`,
            }}
          >
            {line.slice(2)}
          </blockquote>
        );
      }
      if (line.startsWith("```")) {
        return null;
      }
      if (line.startsWith(`- **`)) {
        const parts = line.slice(2);
        return (
          <li key={i} className="text-sm mb-1.5" style={{ color: `rgba(232,234,246,0.7)` }}>
            {parts}
          </li>
        );
      }
      if (/^\d+\./.test(line)) {
        return (
          <li key={i} className="text-sm mb-1.5 list-decimal ml-5" style={{ color: `rgba(232,234,246,0.7)` }}>
            {line.replace(/^\d+\.\s*/, ``)}
          </li>
        );
      }
      if (line.trim() === ``) return <div key={i} className="h-2" />;
      return (
        <p key={i} className="text-sm leading-relaxed mb-1" style={{ color: `rgba(232,234,246,0.75)` }}>
          {line}
        </p>
      );
    });
  };

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
                  onClick={() => setLiked(!liked)}
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
                  <span className="text-xs" style={{ color: `rgba(232,234,246,0.4)` }}>32</span>
                </button>

                <button
                  onClick={() => setBookmarked(!bookmarked)}
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
                  {[`React`, `架构`, `前端`].map((tag) => (
                    <span key={tag} className="tag-glass">{tag}</span>
                  ))}
                </div>

                <h1 className="text-3xl font-black text-foreground leading-tight mb-4">
                  探索现代前端架构的无限可能
                </h1>

                <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center font-bold"
                      style={{ background: `linear-gradient(135deg, #7c6aff, #f472b6)` }}
                    >
                      NC
                    </div>
                    <div>
                      <div className="font-semibold text-sm text-foreground">Nova Chen</div>
                      <div className="text-xs" style={{ color: `rgba(232,234,246,0.4)` }}>2025年6月15日</div>
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
                    <span className="flex items-center gap-1"><Eye size={12} />3,420 阅读</span>
                    <button className="btn-ghost-glass p-2 rounded-xl">
                      <MoreHorizontal size={14} />
                    </button>
                  </div>
                </div>

                {/* Cover image */}
                <div className="rounded-2xl overflow-hidden" style={{ height: 380 }}>
                  <img
                    src="https://picsum.photos/seed/blog1/1200/500"
                    alt="封面"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>

              {/* Article content */}
              <div ref={contentRef} className="glass-card p-8 mb-8">
                <div className="prose max-w-none">
                  {renderContent(mockContent)}
                </div>
              </div>

              {/* Mobile actions */}
              <div className="xl:hidden flex items-center justify-around glass-card p-4 mb-8">
                <button
                  onClick={() => setLiked(!liked)}
                  className="flex items-center gap-2 text-sm"
                  style={{ color: liked ? `#f472b6` : `rgba(232,234,246,0.6)` }}
                >
                  <Heart size={18} fill={liked ? `#f472b6` : `none`} />
                  {liked ? 249 : 248}
                </button>
                <button className="flex items-center gap-2 text-sm" style={{ color: `rgba(232,234,246,0.6)` }}>
                  <MessageCircle size={18} />32
                </button>
                <button
                  onClick={() => setBookmarked(!bookmarked)}
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
                  评论 ({comments.length})
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
                  {comments.map((comment) => (
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
                    {toc.map((item, i) => (
                      <button
                        key={i}
                        className="text-left text-xs py-1.5 px-3 rounded-lg transition-colors hover:bg-white/5"
                        style={{
                          paddingLeft: item.level === 3 ? `1.5rem` : `0.75rem`,
                          color: i === 0 ? `#a78bfa` : `rgba(232,234,246,0.55)`,
                          borderLeft: i === 0 ? `2px solid #7c6aff` : `2px solid transparent`,
                        }}
                      >
                        {item.title}
                      </button>
                    ))}
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
