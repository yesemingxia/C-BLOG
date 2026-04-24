import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Search, TrendingUp, Clock, X, Hash, FileText, User } from "lucide-react";
import BlogCard, { BlogPost } from "../components/BlogCard";
import GlassBackground from "../components/GlassBackground";
import Navbar from "../components/Navbar";

const allPosts: BlogPost[] = [
  { id: 1, title: `探索现代前端架构的无限可能`, excerpt: `深入了解 React 19 的新特性，探讨构建高性能前端架构的方法。`, cover: `https://picsum.photos/seed/blog1/600/400`, author: `Nova Chen`, authorAvatar: `NC`, date: `2025-06-15`, readTime: 8, likes: 248, comments: 32, views: 3420, tags: [`React`, `架构`] },
  { id: 2, title: `CSS 液态玻璃效果完全指南`, excerpt: `全面掌握 Glassmorphism 设计语言，打造令人惊艳的 UI 界面效果。`, cover: `https://picsum.photos/seed/blog2/600/400`, author: `Luna Park`, authorAvatar: `LP`, date: `2025-06-12`, readTime: 12, likes: 512, comments: 67, views: 8930, tags: [`CSS`, `设计`] },
  { id: 3, title: `TypeScript 类型体操深度解析`, excerpt: `条件类型、映射类型，掌握高级 TypeScript 特性让代码更优雅。`, cover: `https://picsum.photos/seed/blog3/600/400`, author: `Kai Zhao`, authorAvatar: `KZ`, date: `2025-06-10`, readTime: 15, likes: 189, comments: 28, views: 4210, tags: [`TypeScript`] },
  { id: 4, title: `AI 辅助编程的未来展望`, excerpt: `大模型如何改变软件开发模式的深度分析与实践思考。`, cover: `https://picsum.photos/seed/blog4/600/400`, author: `Mia Liu`, authorAvatar: `ML`, date: `2025-06-08`, readTime: 10, likes: 673, comments: 94, views: 12500, tags: [`AI`] },
  { id: 5, title: `Tailwind CSS 最佳实践总结`, excerpt: `深入探讨 Tailwind 的工程化实践，提升团队协作效率。`, cover: `https://picsum.photos/seed/blog5/600/400`, author: `Sam Jin`, authorAvatar: `SJ`, date: `2025-06-05`, readTime: 7, likes: 345, comments: 41, views: 6700, tags: [`CSS`, `前端`] },
  { id: 6, title: `从零搭建设计系统完整指南`, excerpt: `如何建立一套统一、可扩展的设计系统，提升产品一致性。`, cover: `https://picsum.photos/seed/blog6/600/400`, author: `Zoe Wang`, authorAvatar: `ZW`, date: `2025-06-01`, readTime: 20, likes: 892, comments: 113, views: 18400, tags: [`设计`] },
];

const hotSearches = [`React 19`, `Glassmorphism`, `TypeScript 5`, `AI 编程`, `设计系统`, `Tailwind CSS`, `前端架构`];
const hotTags = [`React`, `CSS`, `TypeScript`, `设计`, `AI`, `架构`, `前端`, `工程化`];

const SearchPage = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState(``);
  const [results, setResults] = useState<BlogPost[]>([]);
  const [recentSearches, setRecentSearches] = useState([`React 19 新特性`, `前端架构设计`]);
  const [activeTab, setActiveTab] = useState<`posts` | `tags` | `authors`>(`posts`);
  const [hasSearched, setHasSearched] = useState(false);
  const [isLoggedIn] = useState(() => !!localStorage.getItem(`blog_logged_in`));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 300);
  }, []);

  const doSearch = (q: string) => {
    if (!q.trim()) return;
    setHasSearched(true);
    const matched = allPosts.filter(
      (p) =>
        p.title.toLowerCase().includes(q.toLowerCase()) ||
        p.tags.some((t) => t.toLowerCase().includes(q.toLowerCase())) ||
        p.author.toLowerCase().includes(q.toLowerCase())
    );
    setResults(matched);
    if (!recentSearches.includes(q)) {
      setRecentSearches((prev) => [q, ...prev].slice(0, 6));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    doSearch(query);
  };

  const handleQuickSearch = (term: string) => {
    setQuery(term);
    doSearch(term);
  };

  const removeRecent = (term: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRecentSearches((prev) => prev.filter((s) => s !== term));
  };

  const handleLogout = () => {
    localStorage.removeItem(`blog_logged_in`);
    navigate(`/login`);
  };

  return (
    <div data-cmp="SearchPage" className="min-h-screen relative">
      <GlassBackground showParticles={false} />
      <Navbar isLoggedIn={isLoggedIn} onLogout={handleLogout} onLogin={() => navigate(`/login`)} />

      <div className="relative z-10" style={{ paddingTop: 64 }}>
        <div className="mx-auto px-6 py-12" style={{ maxWidth: 900 }}>
          {/* Search header */}
          <div className="text-center mb-10">
            <h1 className="text-4xl font-black gradient-text mb-3">探索一切</h1>
            <p className="text-sm" style={{ color: `rgba(232,234,246,0.5)` }}>搜索文章、标签、作者...</p>
          </div>

          {/* Search bar */}
          <form onSubmit={handleSubmit} className="relative mb-10">
            <div
              className="flex items-center gap-3 px-5 py-4 rounded-2xl"
              style={{
                background: `rgba(255,255,255,0.06)`,
                border: `1px solid rgba(124,106,255,0.25)`,
                backdropFilter: `blur(20px)`,
                boxShadow: `0 0 30px rgba(124,106,255,0.12)`,
              }}
            >
              <Search size={20} style={{ color: `#7c6aff`, flexShrink: 0 }} />
              <input
                ref={inputRef}
                type="text"
                placeholder="搜索文章、标签或作者..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1 bg-transparent text-foreground outline-none text-base"
                style={{ caretColor: `#7c6aff`, color: `rgba(232,234,246,0.9)` }}
              />
              <div className={query ? `` : `hidden`}>
                <button
                  type="button"
                  onClick={() => { setQuery(``); setHasSearched(false); inputRef.current?.focus(); }}
                  className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
                >
                  <X size={14} style={{ color: `rgba(232,234,246,0.5)` }} />
                </button>
              </div>
              <button
                type="submit"
                className="btn-primary-glass px-5 py-2 rounded-xl text-sm font-semibold flex-shrink-0"
              >
                搜索
              </button>
            </div>
          </form>

          {/* Pre-search state */}
          <div className={hasSearched ? `hidden` : ``}>
            {/* Recent searches */}
            <div className={recentSearches.length > 0 ? `mb-8` : `hidden`}>
              <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                <Clock size={14} style={{ color: `rgba(232,234,246,0.5)` }} />
                最近搜索
              </h3>
              <div className="flex flex-wrap gap-2">
                {recentSearches.map((term) => (
                  <div
                    key={term}
                    onClick={() => handleQuickSearch(term)}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer transition-all group"
                    style={{
                      background: `rgba(255,255,255,0.05)`,
                      border: `1px solid rgba(255,255,255,0.07)`,
                    }}
                  >
                    <span className="text-sm" style={{ color: `rgba(232,234,246,0.7)` }}>{term}</span>
                    <button onClick={(e) => removeRecent(term, e)} className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <X size={12} style={{ color: `rgba(232,234,246,0.4)` }} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Hot searches */}
            <div className="mb-10">
              <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                <TrendingUp size={14} style={{ color: `#f59e0b` }} />
                热门搜索
              </h3>
              <div className="flex flex-wrap gap-2">
                {hotSearches.map((term, i) => (
                  <button
                    key={term}
                    onClick={() => handleQuickSearch(term)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm transition-all"
                    style={{
                      background: `rgba(255,255,255,0.04)`,
                      border: `1px solid rgba(255,255,255,0.07)`,
                      color: `rgba(232,234,246,0.7)`,
                    }}
                  >
                    <span className="text-xs font-bold w-4" style={{ color: i < 3 ? `#f472b6` : `rgba(232,234,246,0.35)` }}>
                      {String(i + 1).padStart(2, `0`)}
                    </span>
                    {term}
                  </button>
                ))}
              </div>
            </div>

            {/* Hot tags */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                <Hash size={14} style={{ color: `#38bdf8` }} />
                热门标签
              </h3>
              <div className="flex flex-wrap gap-2">
                {hotTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => handleQuickSearch(tag)}
                    className="tag-glass"
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Search results */}
          <div className={hasSearched ? `` : `hidden`}>
            {/* Result header */}
            <div className="flex items-center justify-between mb-6">
              <div className="text-sm" style={{ color: `rgba(232,234,246,0.6)` }}>
                <span>搜索 "</span>
                <span style={{ color: `#a78bfa` }}>{query}</span>
                <span>" 找到 {results.length} 个结果</span>
              </div>

              {/* Tabs */}
              <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: `rgba(255,255,255,0.05)` }}>
                {([
                  { key: `posts` as const, label: `文章`, icon: FileText },
                  { key: `tags` as const, label: `标签`, icon: Hash },
                  { key: `authors` as const, label: `作者`, icon: User },
                ]).map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all"
                    style={{
                      background: activeTab === tab.key ? `rgba(124,106,255,0.2)` : `transparent`,
                      color: activeTab === tab.key ? `#a78bfa` : `rgba(232,234,246,0.5)`,
                    }}
                  >
                    <tab.icon size={12} />
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Posts results */}
            <div className={activeTab === `posts` ? `flex flex-col gap-4` : `hidden`}>
              {results.map((post) => (
                <BlogCard key={post.id} post={post} variant="compact" />
              ))}
              <div className={results.length === 0 ? `text-center py-16` : `hidden`}>
                <div className="text-4xl mb-4">🔍</div>
                <div className="text-foreground font-medium mb-2">没有找到相关文章</div>
                <div className="text-sm" style={{ color: `rgba(232,234,246,0.4)` }}>换个关键词试试吧</div>
              </div>
            </div>

            {/* Tags results */}
            <div className={activeTab === `tags` ? `` : `hidden`}>
              <div className="flex flex-wrap gap-3">
                {hotTags.filter((t) => t.toLowerCase().includes(query.toLowerCase())).map((tag) => (
                  <div
                    key={tag}
                    className="glass-card px-5 py-4 flex items-center gap-3 cursor-pointer hover:bg-white/5 transition-all"
                    onClick={() => handleQuickSearch(tag)}
                  >
                    <Hash size={16} style={{ color: `#7c6aff` }} />
                    <div>
                      <div className="text-sm font-semibold text-foreground">{tag}</div>
                      <div className="text-xs" style={{ color: `rgba(232,234,246,0.4)` }}>
                        {Math.floor(Math.random() * 50 + 10)} 篇文章
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Authors results */}
            <div className={activeTab === `authors` ? `` : `hidden`}>
              <div className="flex flex-col gap-3">
                {[
                  { name: `Nova Chen`, handle: `@novachen`, avatar: `NC`, followers: `3,420`, posts: 24, bio: `前端工程师 / UI设计爱好者` },
                  { name: `Luna Park`, handle: `@lunapark`, avatar: `LP`, followers: `1,892`, posts: 15, bio: `全栈开发者 / 开源爱好者` },
                ].filter((u) =>
                  u.name.toLowerCase().includes(query.toLowerCase()) ||
                  u.handle.toLowerCase().includes(query.toLowerCase())
                ).map((user) => (
                  <div
                    key={user.handle}
                    className="glass-card p-4 flex items-center gap-4 cursor-pointer hover:bg-white/5 transition-all"
                    onClick={() => navigate(`/profile`)}
                  >
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-sm flex-shrink-0"
                      style={{ background: `linear-gradient(135deg, #7c6aff, #38bdf8)` }}
                    >
                      {user.avatar}
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-sm text-foreground">{user.name}</div>
                      <div className="text-xs" style={{ color: `rgba(232,234,246,0.45)` }}>{user.handle} · {user.bio}</div>
                    </div>
                    <div className="text-right text-xs" style={{ color: `rgba(232,234,246,0.4)` }}>
                      <div className="font-semibold text-foreground">{user.followers}</div>
                      <div>粉丝</div>
                    </div>
                    <button
                      className="px-4 py-2 rounded-xl text-xs font-medium ml-4"
                      style={{ background: `rgba(124,106,255,0.12)`, color: `#a78bfa`, border: `1px solid rgba(124,106,255,0.2)` }}
                    >
                      关注
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SearchPage;
