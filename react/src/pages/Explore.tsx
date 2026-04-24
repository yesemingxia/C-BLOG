import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Filter, TrendingUp, Grid, List, SlidersHorizontal } from "lucide-react";
import BlogCard, { BlogPost } from "../components/BlogCard";
import GlassBackground from "../components/GlassBackground";
import Navbar from "../components/Navbar";

const allPosts: BlogPost[] = [
  {
    id: 1, title: `探索现代前端架构的无限可能`, excerpt: `深入了解 React 19 的新特性，探讨如何在大型项目中构建高性能、可维护的前端架构体系。`,
    cover: `https://picsum.photos/seed/blog1/600/400`, author: `Nova Chen`, authorAvatar: `NC`, date: `2025-06-15`, readTime: 8, likes: 248, comments: 32, views: 3420, tags: [`React`, `架构`, `前端`],
  },
  {
    id: 2, title: `CSS 液态玻璃效果完全指南`, excerpt: `从原理到实践，全面掌握 Glassmorphism 设计语言，打造令人惊艳的 UI 界面效果。`,
    cover: `https://picsum.photos/seed/blog2/600/400`, author: `Luna Park`, authorAvatar: `LP`, date: `2025-06-12`, readTime: 12, likes: 512, comments: 67, views: 8930, tags: [`CSS`, `设计`, `UI`],
  },
  {
    id: 3, title: `TypeScript 5.0 类型体操深度解析`, excerpt: `条件类型、映射类型、模板字面量类型，掌握高级特性让你的代码更优雅。`,
    cover: `https://picsum.photos/seed/blog3/600/400`, author: `Kai Zhao`, authorAvatar: `KZ`, date: `2025-06-10`, readTime: 15, likes: 189, comments: 28, views: 4210, tags: [`TypeScript`, `编程`],
  },
  {
    id: 4, title: `AI 辅助编程的未来展望`, excerpt: `GPT-4o、Claude 3.5 等大模型如何改变软件开发模式，以及开发者的应对策略。`,
    cover: `https://picsum.photos/seed/blog4/600/400`, author: `Mia Liu`, authorAvatar: `ML`, date: `2025-06-08`, readTime: 10, likes: 673, comments: 94, views: 12500, tags: [`AI`, `未来`, `开发`],
  },
  {
    id: 5, title: `Rust 在 Web 开发中的崛起`, excerpt: `WebAssembly、边缘计算、高性能后端，Rust 正在成为 Web 开发者的新宠儿。`,
    cover: `https://picsum.photos/seed/blog5/600/400`, author: `Alex Wu`, authorAvatar: `AW`, date: `2025-06-06`, readTime: 11, likes: 321, comments: 45, views: 5670, tags: [`Rust`, `WebAssembly`],
  },
  {
    id: 6, title: `构建全栈应用的最佳实践 2025`, excerpt: `Next.js 15 + Prisma + tRPC 技术栈深度实战，从零到上线的完整流程记录。`,
    cover: `https://picsum.photos/seed/blog6/600/400`, author: `Sam Jin`, authorAvatar: `SJ`, date: `2025-06-04`, readTime: 20, likes: 445, comments: 58, views: 7890, tags: [`Next.js`, `全栈`],
  },
  {
    id: 7, title: `微前端架构实战经验分享`, excerpt: `从单体应用到微前端，我们踩过的那些坑和最终的解决方案全记录。`,
    cover: `https://picsum.photos/seed/blog7/600/400`, author: `Ben Li`, authorAvatar: `BL`, date: `2025-06-02`, readTime: 18, likes: 267, comments: 41, views: 6120, tags: [`架构`, `微前端`],
  },
  {
    id: 8, title: `Docker + Kubernetes 容器化部署`, excerpt: `从零开始学习容器技术，掌握现代 DevOps 工作流的核心技能。`,
    cover: `https://picsum.photos/seed/blog8/600/400`, author: `Zoe Wang`, authorAvatar: `ZW`, date: `2025-05-30`, readTime: 16, likes: 398, comments: 52, views: 9340, tags: [`DevOps`, `Docker`],
  },
  {
    id: 9, title: `设计系统从零搭建实践指南`, excerpt: `组件库、设计令牌、文档驱动开发，打造企业级设计系统的完整方案。`,
    cover: `https://picsum.photos/seed/blog9/600/400`, author: `Ella Song`, authorAvatar: `ES`, date: `2025-05-28`, readTime: 14, likes: 534, comments: 73, views: 11200, tags: [`设计系统`, `UI`, `前端`],
  },
];

const tabs = [`全部`, `技术`, `设计`, `AI`, `工程化`];
const sortOptions = [`最新`, `最热门`, `最多阅读`];

const Explore = () => {
  const navigate = useNavigate();
  const [searchVal, setSearchVal] = useState(``);
  const [activeTab, setActiveTab] = useState(`全部`);
  const [sortBy, setSortBy] = useState(`最新`);
  const [viewMode, setViewMode] = useState<`grid` | `list`>(`grid`);
  const [showFilter, setShowFilter] = useState(false);
  const [isLoggedIn] = useState(() => !!localStorage.getItem(`blog_logged_in`));

  const filtered = allPosts.filter((p) => {
    const matchSearch = !searchVal || p.title.includes(searchVal) || p.tags.some((t) => t.includes(searchVal));
    const matchTab = activeTab === `全部` ||
      (activeTab === `技术` && p.tags.some((t) => [`React`, `TypeScript`, `Rust`, `微前端`].includes(t))) ||
      (activeTab === `设计` && p.tags.some((t) => [`设计`, `UI`, `CSS`, `设计系统`].includes(t))) ||
      (activeTab === `AI` && p.tags.some((t) => [`AI`].includes(t))) ||
      (activeTab === `工程化` && p.tags.some((t) => [`DevOps`, `Docker`, `架构`, `全栈`, `Next.js`].includes(t)));
    return matchSearch && matchTab;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === `最热门`) return b.likes - a.likes;
    if (sortBy === `最多阅读`) return b.views - a.views;
    return b.id - a.id;
  });

  const handleLogout = () => {
    localStorage.removeItem(`blog_logged_in`);
    navigate(`/login`);
  };

  return (
    <div data-cmp="Explore" className="min-h-screen relative">
      <GlassBackground showParticles={false} />
      <Navbar isLoggedIn={isLoggedIn} onLogout={handleLogout} onLogin={() => navigate(`/login`)} />

      <div className="relative z-10" style={{ paddingTop: 64 }}>
        {/* Hero banner */}
        <div
          className="py-14 text-center"
          style={{
            background: `linear-gradient(180deg, rgba(124,106,255,0.05) 0%, transparent 100%)`,
            borderBottom: `1px solid rgba(255,255,255,0.06)`,
          }}
        >
          <div className="mx-auto px-6" style={{ maxWidth: 1440 }}>
            <h1 className="text-4xl font-black text-foreground mb-3">
              <TrendingUp size={28} className="inline mr-3 mb-1" style={{ color: `#7c6aff` }} />
              发现精彩内容
            </h1>
            <p className="text-base mb-8" style={{ color: `rgba(232,234,246,0.55)` }}>
              探索来自全球创作者的优质文章、技术分享和深度思考
            </p>

            {/* Search bar */}
            <div className="max-w-xl mx-auto relative">
              <Search
                size={18}
                className="absolute left-4 top-1/2 -translate-y-1/2"
                style={{ color: `rgba(255,255,255,0.35)` }}
              />
              <input
                type="text"
                placeholder="搜索文章、标签、作者..."
                value={searchVal}
                onChange={(e) => setSearchVal(e.target.value)}
                className="glass-input w-full pl-12 pr-4 py-4 rounded-2xl text-base"
              />
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="mx-auto px-6 py-8" style={{ maxWidth: 1440 }}>
          {/* Toolbar */}
          <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
            {/* Category tabs */}
            <div className="flex items-center gap-2 flex-wrap">
              {tabs.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
                  style={{
                    background: activeTab === tab ? `rgba(124,106,255,0.2)` : `rgba(255,255,255,0.05)`,
                    color: activeTab === tab ? `#a78bfa` : `rgba(232,234,246,0.6)`,
                    border: `1px solid ${activeTab === tab ? `rgba(124,106,255,0.35)` : `rgba(255,255,255,0.07)`}`,
                  }}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Controls */}
            <div className="flex items-center gap-3">
              <div className="relative">
                <button
                  onClick={() => setShowFilter(!showFilter)}
                  className="btn-ghost-glass flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-foreground"
                >
                  <SlidersHorizontal size={15} />
                  {sortBy}
                </button>
                <div
                  className="absolute right-0 top-12 w-40 glass rounded-xl overflow-hidden"
                  style={{
                    opacity: showFilter ? 1 : 0,
                    pointerEvents: showFilter ? `auto` : `none`,
                    transform: showFilter ? `translateY(0)` : `translateY(-6px)`,
                    transition: `all 0.2s`,
                    zIndex: 50,
                  }}
                >
                  {sortOptions.map((opt) => (
                    <button
                      key={opt}
                      onClick={() => { setSortBy(opt); setShowFilter(false); }}
                      className="w-full text-left px-4 py-3 text-sm transition-colors hover:bg-white/5"
                      style={{ color: sortBy === opt ? `#a78bfa` : `rgba(232,234,246,0.7)` }}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
                <div
                  className="fixed inset-0"
                  style={{ zIndex: -1, pointerEvents: showFilter ? `auto` : `none` }}
                  onClick={() => setShowFilter(false)}
                />
              </div>

              <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: `rgba(255,255,255,0.05)` }}>
                <button
                  onClick={() => setViewMode(`grid`)}
                  className="p-2 rounded-lg transition-all"
                  style={{ background: viewMode === `grid` ? `rgba(124,106,255,0.2)` : `transparent` }}
                >
                  <Grid size={15} style={{ color: viewMode === `grid` ? `#a78bfa` : `rgba(232,234,246,0.5)` }} />
                </button>
                <button
                  onClick={() => setViewMode(`list`)}
                  className="p-2 rounded-lg transition-all"
                  style={{ background: viewMode === `list` ? `rgba(124,106,255,0.2)` : `transparent` }}
                >
                  <List size={15} style={{ color: viewMode === `list` ? `#a78bfa` : `rgba(232,234,246,0.5)` }} />
                </button>
              </div>
            </div>
          </div>

          {/* Results count */}
          <div className="mb-5 text-sm" style={{ color: `rgba(232,234,246,0.4)` }}>
            共找到 <span style={{ color: `#a78bfa` }}>{sorted.length}</span> 篇文章
          </div>

          {/* Post grid/list */}
          <div className={viewMode === `grid` ? `flex flex-wrap gap-5` : `flex flex-col gap-4`}>
            {sorted.map((post, i) => (
              <div
                key={post.id}
                style={{
                  width: viewMode === `grid` ? `calc(33.33% - 14px)` : `100%`,
                  minWidth: viewMode === `grid` ? 280 : undefined,
                  animationDelay: `${i * 0.06}s`,
                  animation: `slide-in-up 0.5s ease forwards`,
                  opacity: 0,
                }}
              >
                <BlogCard post={post} variant={viewMode === `list` ? `compact` : `default`} />
              </div>
            ))}
          </div>

          <div className={sorted.length === 0 ? `` : `hidden`}>
            <div className="text-center py-20">
              <div className="text-4xl mb-4">🔍</div>
              <div className="text-foreground font-medium mb-2">未找到相关文章</div>
              <div className="text-sm" style={{ color: `rgba(232,234,246,0.4)` }}>
                尝试更换搜索关键词或分类
              </div>
            </div>
          </div>

          {/* Load more */}
          <div className={sorted.length > 0 ? `text-center mt-10` : `hidden`}>
            <button className="btn-ghost-glass px-10 py-3.5 rounded-2xl text-sm font-medium text-foreground">
              加载更多文章
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Explore;
