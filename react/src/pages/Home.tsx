import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  TrendingUp, Flame, Star, ChevronRight,
  ArrowRight, Rss, Hash
} from "lucide-react";
import BlogCard, { BlogPost } from "../components/BlogCard";
import GlassBackground from "../components/GlassBackground";
import Navbar from "../components/Navbar";

const posts: BlogPost[] = [
  {
    id: 1,
    title: `探索现代前端架构的无限可能`,
    excerpt: `深入了解 React 19 的新特性，探讨如何在大型项目中构建高性能、可维护的前端架构体系。`,
    cover: `https://picsum.photos/seed/blog1/600/400`,
    author: `Nova Chen`,
    authorAvatar: `NC`,
    date: `2025-06-15`,
    readTime: 8,
    likes: 248,
    comments: 32,
    views: 3420,
    tags: [`React`, `架构`, `前端`],
    featured: true,
  },
  {
    id: 2,
    title: `CSS 液态玻璃效果完全指南`,
    excerpt: `从原理到实践，全面掌握 Glassmorphism 设计语言，打造令人惊艳的 UI 界面效果。`,
    cover: `https://picsum.photos/seed/blog2/600/400`,
    author: `Luna Park`,
    authorAvatar: `LP`,
    date: `2025-06-12`,
    readTime: 12,
    likes: 512,
    comments: 67,
    views: 8930,
    tags: [`CSS`, `设计`, `UI`],
  },
  {
    id: 3,
    title: `TypeScript 5.0 类型体操深度解析`,
    excerpt: `条件类型、映射类型、模板字面量类型，掌握这些高级特性让你的代码更加优雅健壮。`,
    cover: `https://picsum.photos/seed/blog3/600/400`,
    author: `Kai Zhao`,
    authorAvatar: `KZ`,
    date: `2025-06-10`,
    readTime: 15,
    likes: 189,
    comments: 28,
    views: 4210,
    tags: [`TypeScript`, `编程`],
  },
  {
    id: 4,
    title: `AI 辅助编程的未来展望`,
    excerpt: `GPT-4o、Claude 3.5 Sonnet 等大模型如何改变软件开发模式，以及开发者的应对策略。`,
    cover: `https://picsum.photos/seed/blog4/600/400`,
    author: `Mia Liu`,
    authorAvatar: `ML`,
    date: `2025-06-08`,
    readTime: 10,
    likes: 673,
    comments: 94,
    views: 12500,
    tags: [`AI`, `未来`, `开发`],
  },
  {
    id: 5,
    title: `Rust 语言在 Web 开发中的崛起`,
    excerpt: `WebAssembly、边缘计算、高性能后端，Rust 正在成为 Web 开发者的新宠儿。`,
    cover: `https://picsum.photos/seed/blog5/600/400`,
    author: `Alex Wu`,
    authorAvatar: `AW`,
    date: `2025-06-06`,
    readTime: 11,
    likes: 321,
    comments: 45,
    views: 5670,
    tags: [`Rust`, `WebAssembly`, `后端`],
  },
  {
    id: 6,
    title: `构建全栈应用的最佳实践 2025`,
    excerpt: `Next.js 15 + Prisma + tRPC 技术栈深度实战，从零到上线的完整流程记录。`,
    cover: `https://picsum.photos/seed/blog6/600/400`,
    author: `Sam Jin`,
    authorAvatar: `SJ`,
    date: `2025-06-04`,
    readTime: 20,
    likes: 445,
    comments: 58,
    views: 7890,
    tags: [`Next.js`, `全栈`, `实战`],
  },
];

const trendingTags = [
  `React`, `TypeScript`, `AI`, `设计`, `前端`, `后端`,
  `算法`, `架构`, `Vue`, `Node.js`, `Python`, `DevOps`,
];

const categories = [
  { name: `技术`, count: 128, color: `#7c6aff`, icon: `⚡` },
  { name: `设计`, count: 64, color: `#38bdf8`, icon: `🎨` },
  { name: `AI / ML`, count: 89, color: `#f472b6`, icon: `🤖` },
  { name: `生活`, count: 45, color: `#34d399`, icon: `🌿` },
  { name: `职场`, count: 37, color: `#f59e0b`, icon: `💼` },
];

const Home = () => {
  const navigate = useNavigate();
  const [activeCategory, setActiveCategory] = useState(`全部`);
  const [isLoggedIn] = useState(() => !!localStorage.getItem(`blog_logged_in`));

  const filteredPosts = activeCategory === `全部`
    ? posts
    : posts.filter((p) => p.tags.some((t) => t === activeCategory));

  const handleLogout = () => {
    localStorage.removeItem(`blog_logged_in`);
    navigate(`/login`);
  };

  return (
    <div data-cmp="Home" className="min-h-screen relative">
      <GlassBackground showParticles={false} />
      <Navbar
        isLoggedIn={isLoggedIn}
        onLogout={handleLogout}
        onLogin={() => navigate(`/login`)}
      />

      <div className="relative z-10" style={{ paddingTop: 64 }}>
        {/* Hero section */}
        <div
          className="mx-auto px-6 py-20 text-center"
          style={{ maxWidth: 1440 }}
        >
          <div
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-6 text-sm"
            style={{
              background: `rgba(124,106,255,0.1)`,
              border: `1px solid rgba(124,106,255,0.2)`,
              color: `#a78bfa`,
            }}
          >
            <Sparkles size={14} />
            发现精彩内容，探索无限知识
          </div>

          <h1
            className="font-black mb-4 leading-none"
            style={{ fontSize: `clamp(2.5rem, 5vw, 4rem)` }}
          >
            <span className="gradient-text">用文字点亮</span>
            <br />
            <span className="text-foreground">你的思想宇宙</span>
          </h1>

          <p
            className="text-lg max-w-xl mx-auto mb-8"
            style={{ color: `rgba(232,234,246,0.6)` }}
          >
            加入数万创作者的平台，分享技术见解、设计灵感和人生思考
          </p>

          <div className="flex items-center justify-center gap-4 flex-wrap">
            <button
              onClick={() => isLoggedIn ? navigate(`/write`) : navigate(`/login`)}
              className="btn-primary-glass px-8 py-3.5 rounded-2xl text-base font-semibold flex items-center gap-2"
            >
              开始写作 <ArrowRight size={18} />
            </button>
            <button
              onClick={() => navigate(`/explore`)}
              className="btn-ghost-glass px-8 py-3.5 rounded-2xl text-base font-medium text-foreground"
            >
              探索文章
            </button>
          </div>

          {/* Stats */}
          <div className="flex items-center justify-center gap-8 mt-12 flex-wrap">
            {[
              { label: `创作者`, value: `12,400+` },
              { label: `文章`, value: `58,000+` },
              { label: `月阅读`, value: `2.3M+` },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-2xl font-black gradient-text">{stat.value}</div>
                <div className="text-sm mt-0.5" style={{ color: `rgba(232,234,246,0.45)` }}>{stat.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Main content */}
        <div className="mx-auto px-6 pb-20" style={{ maxWidth: 1440 }}>
          <div className="flex gap-8">
            {/* Left sidebar */}
            <div className="hidden lg:block flex-shrink-0" style={{ width: 220 }}>
              <div className="sticky" style={{ top: 80 }}>
                <div className="glass-card p-5 mb-4">
                  <div className="flex items-center gap-2 mb-4 text-sm font-semibold text-foreground">
                    <Hash size={15} style={{ color: `#7c6aff` }} />
                    分类
                  </div>
                  <div className="flex flex-col gap-1">
                    {[{ name: `全部`, count: posts.length, color: `#7c6aff`, icon: `✦` }, ...categories].map((cat) => (
                      <button
                        key={cat.name}
                        onClick={() => setActiveCategory(cat.name)}
                        className="flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition-all text-left"
                        style={{
                          background: activeCategory === cat.name ? `rgba(124,106,255,0.12)` : `transparent`,
                          color: activeCategory === cat.name ? `#a78bfa` : `rgba(232,234,246,0.65)`,
                          borderLeft: activeCategory === cat.name ? `2px solid #7c6aff` : `2px solid transparent`,
                        }}
                      >
                        <span className="flex items-center gap-2">
                          <span>{cat.icon}</span>
                          {cat.name}
                        </span>
                        <span
                          className="text-xs px-1.5 py-0.5 rounded-lg"
                          style={{
                            background: `rgba(124,106,255,0.1)`,
                            color: `rgba(167,139,250,0.7)`,
                          }}
                        >
                          {cat.count}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* RSS */}
                <button
                  onClick={() => navigate(`/explore`)}
                  className="w-full glass-card p-4 flex items-center gap-3 text-sm text-left"
                >
                  <Rss size={16} style={{ color: `#f59e0b` }} />
                  <div>
                    <div className="font-medium text-foreground">订阅更新</div>
                    <div className="text-xs" style={{ color: `rgba(232,234,246,0.4)` }}>获取最新文章推送</div>
                  </div>
                  <ChevronRight size={14} className="ml-auto" style={{ color: `rgba(232,234,246,0.3)` }} />
                </button>
              </div>
            </div>

            {/* Center: post list */}
            <div className="flex-1 min-w-0">
              {/* Featured post */}
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-4">
                  <Flame size={16} style={{ color: `#f472b6` }} />
                  <span className="text-sm font-semibold text-foreground">精选推荐</span>
                </div>
                <BlogCard post={posts[0]} variant="featured" />
              </div>

              {/* Filter tabs */}
              <div className="flex items-center gap-2 mb-6 flex-wrap">
                {[`最新`, `最热`, `关注`].map((tab) => (
                  <button
                    key={tab}
                    className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
                    style={{
                      background: tab === `最新` ? `rgba(124,106,255,0.15)` : `rgba(255,255,255,0.05)`,
                      color: tab === `最新` ? `#a78bfa` : `rgba(232,234,246,0.6)`,
                      border: `1px solid ${tab === `最新` ? `rgba(124,106,255,0.3)` : `rgba(255,255,255,0.07)`}`,
                    }}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {/* Post grid */}
              <div className="flex flex-col gap-5">
                {filteredPosts.slice(1).map((post, i) => (
                  <div
                    key={post.id}
                    style={{
                      animationDelay: `${i * 0.08}s`,
                      animation: `slide-in-up 0.5s ease forwards`,
                      opacity: 0,
                    }}
                  >
                    <BlogCard post={post} variant="default" />
                  </div>
                ))}
              </div>

              <div className="text-center mt-8">
                <button
                  onClick={() => navigate(`/explore`)}
                  className="btn-ghost-glass px-8 py-3 rounded-2xl text-sm font-medium text-foreground flex items-center gap-2 mx-auto"
                >
                  加载更多 <ChevronRight size={15} />
                </button>
              </div>
            </div>

            {/* Right sidebar */}
            <div className="hidden xl:block flex-shrink-0" style={{ width: 260 }}>
              <div className="sticky" style={{ top: 80 }}>
                {/* Trending */}
                <div className="glass-card p-5 mb-4">
                  <div className="flex items-center gap-2 mb-4 text-sm font-semibold text-foreground">
                    <TrendingUp size={15} style={{ color: `#38bdf8` }} />
                    热门文章
                  </div>
                  <div className="flex flex-col gap-3">
                    {posts.slice(0, 4).map((post, i) => (
                      <div
                        key={post.id}
                        onClick={() => navigate(`/post`)}
                        className="flex items-start gap-3 cursor-pointer group"
                      >
                        <span
                          className="text-xs font-black flex-shrink-0 mt-0.5"
                          style={{
                            color: i < 3 ? `#7c6aff` : `rgba(232,234,246,0.3)`,
                            minWidth: 18,
                          }}
                        >
                          {String(i + 1).padStart(2, `0`)}
                        </span>
                        <div>
                          <p
                            className="text-xs font-medium leading-snug transition-colors group-hover:text-purple-300"
                            style={{ color: `rgba(232,234,246,0.8)` }}
                          >
                            {post.title}
                          </p>
                          <span className="text-xs mt-0.5" style={{ color: `rgba(232,234,246,0.35)` }}>
                            {post.views.toLocaleString()} 阅读
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Tags cloud */}
                <div className="glass-card p-5 mb-4">
                  <div className="flex items-center gap-2 mb-4 text-sm font-semibold text-foreground">
                    <Star size={15} style={{ color: `#f59e0b` }} />
                    热门标签
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {trendingTags.map((tag) => (
                      <button
                        key={tag}
                        onClick={() => navigate(`/explore`)}
                        className="tag-glass"
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Write CTA */}
                <div
                  className="p-5 rounded-2xl text-center"
                  style={{
                    background: `linear-gradient(135deg, rgba(124,106,255,0.15), rgba(56,189,248,0.1))`,
                    border: `1px solid rgba(124,106,255,0.2)`,
                    backdropFilter: `blur(12px)`,
                  }}
                >
                  <div className="text-2xl mb-2">✍️</div>
                  <div className="text-sm font-semibold text-foreground mb-1">分享你的想法</div>
                  <div className="text-xs mb-3" style={{ color: `rgba(232,234,246,0.5)` }}>
                    加入创作者社区，记录和分享知识
                  </div>
                  <button
                    onClick={() => isLoggedIn ? navigate(`/write`) : navigate(`/login`)}
                    className="btn-primary-glass w-full py-2.5 rounded-xl text-sm font-medium"
                  >
                    {isLoggedIn ? `开始写作` : `立即加入`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Sparkles is used inline
const Sparkles = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
  </svg>
);

export default Home;
