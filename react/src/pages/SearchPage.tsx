import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Search, TrendingUp, Clock, X, Hash, FileText, User } from "lucide-react";
import BlogCard, { BlogPost } from "../components/BlogCard";
import GlassBackground from "../components/GlassBackground";
import Navbar from "../components/Navbar";
import { searchApi, tagsApi, ApiPost, ApiTag } from "../lib/api";

const hotSearches = [`React 19`, `Glassmorphism`, `TypeScript 5`, `AI 编程`, `设计系统`, `Tailwind CSS`, `前端架构`];
const hotTags = [`React`, `CSS`, `TypeScript`, `设计`, `AI`, `架构`, `前端`, `工程化`];

// @cuiruoni+将后端ApiPost映射为BlogCard所需的BlogPost格式
const mapApiPostToBlogPost = (p: ApiPost): BlogPost => ({
  id: p.id,
  title: p.title,
  excerpt: p.excerpt ?? p.summary ?? ``,
  cover: p.cover ?? `https://picsum.photos/seed/post${p.id}/600/400`,
  author: p.author ?? `匿名`,
  authorAvatar: p.author ? p.author.split(` `).map((w: string) => w[0]).join(``).slice(0, 2).toUpperCase() : `??`,
  date: p.created_at ?? ``,
  readTime: Math.max(1, Math.round((p.content_md ?? p.content ?? ``).length / 300) || 5),
  likes: p.likes ?? 0,
  comments: p.comments_count ?? 0,
  views: p.views ?? 0,
  tags: p.tags ?? [],
});

// @cuiruoni+搜索页组件：热门搜索推荐+历史记录+文章/标签/作者三维度搜索结果
const SearchPage = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState(``);
  const [results, setResults] = useState<BlogPost[]>([]);
  // @cuiruoni+搜索历史记录，最多保留6条
  const [recentSearches, setRecentSearches] = useState([`React 19 新特性`, `前端架构设计`]);
  // @cuiruoni+三维度结果切换：posts(文章)、tags(标签)、authors(作者)
  const [activeTab, setActiveTab] = useState<`posts` | `tags` | `authors`>(`posts`);
  const [hasSearched, setHasSearched] = useState(false);
  const [isLoggedIn] = useState(() => !!localStorage.getItem(`blog_logged_in`));
  const [apiTags, setApiTags] = useState<string[]>(hotTags);
  const inputRef = useRef<HTMLInputElement>(null);

  // @cuiruoni+从后端加载标签列表
  useEffect(() => {
    tagsApi.list().then((res) => {
      if (res?.length) setApiTags(res.map((t: ApiTag) => t.name));
    }).catch(() => {});
  }, []);

  // @cuiruoni+从搜索结果中提取去重的作者列表
  const matchedAuthors = (() => {
    const authorMap = new Map<string, { name: string; count: number }>();
    for (const r of results) {
      if (!r.author) continue;
      const existing = authorMap.get(r.author);
      if (existing) existing.count++;
      else authorMap.set(r.author, { name: r.author, count: 1 });
    }
    return Array.from(authorMap.values())
      .filter((a) => !query || a.name.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => b.count - a.count);
  })();

  // @cuiruoni+从搜索结果中提取匹配的标签
  const matchedTags = (() => {
    const tagSet = new Set<string>();
    for (const r of results) {
      if (r.tags) r.tags.forEach((t) => tagSet.add(t));
    }
    const allMatched = query
      ? [...tagSet].filter((t) => t.toLowerCase().includes(query.toLowerCase()))
      : [...tagSet];
    // @cuiruoni+如果搜索结果中没有标签，则从后端标签列表中匹配
    if (allMatched.length === 0 && query) {
      return apiTags.filter((t) => t.toLowerCase().includes(query.toLowerCase()));
    }
    return allMatched.length > 0 ? allMatched : apiTags;
  })();

  // @cuiruoni+页面加载后自动聚焦搜索框，提升用户体验
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 300);
  }, []);

  // @cuiruoni+调用后端searchApi搜索，同时更新搜索历史
  const doSearch = async (q: string) => {
    if (!q.trim()) return;
    setHasSearched(true);
    const apiResults = await searchApi.search(q);
    setResults(apiResults.map(mapApiPostToBlogPost));
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
                {matchedTags.map((tag) => (
                  <div
                    key={tag}
                    className="glass-card px-5 py-4 flex items-center gap-3 cursor-pointer hover:bg-white/5 transition-all"
                    onClick={() => handleQuickSearch(tag)}
                  >
                    <Hash size={16} style={{ color: `#7c6aff` }} />
                    <div>
                      <div className="text-sm font-semibold text-foreground">{tag}</div>
                      <div className="text-xs" style={{ color: `rgba(232,234,246,0.4)` }}>
                        标签
                      </div>
                    </div>
                  </div>
                ))}
                {matchedTags.length === 0 && (
                  <div className="text-center py-16 w-full">
                    <div className="text-4xl mb-4">🏷️</div>
                    <div className="text-foreground font-medium mb-2">没有找到相关标签</div>
                    <div className="text-sm" style={{ color: `rgba(232,234,246,0.4)` }}>换个关键词试试吧</div>
                  </div>
                )}
              </div>
            </div>

            {/* Authors results */}
            <div className={activeTab === `authors` ? `` : `hidden`}>
              <div className="flex flex-col gap-3">
                {matchedAuthors.map((author) => (
                  <div
                    key={author.name}
                    className="glass-card p-4 flex items-center gap-4 cursor-pointer hover:bg-white/5 transition-all"
                    onClick={() => navigate(`/profile/${encodeURIComponent(author.name)}`)}
                  >
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-sm flex-shrink-0"
                      style={{ background: `linear-gradient(135deg, #7c6aff, #38bdf8)` }}
                    >
                      {author.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-sm text-foreground">{author.name}</div>
                      <div className="text-xs" style={{ color: `rgba(232,234,246,0.45)` }}>{author.count} 篇文章</div>
                    </div>
                    <button
                      className="px-4 py-2 rounded-xl text-xs font-medium"
                      style={{ background: `rgba(124,106,255,0.12)`, color: `#a78bfa`, border: `1px solid rgba(124,106,255,0.2)` }}
                    >
                      查看
                    </button>
                  </div>
                ))}
                {matchedAuthors.length === 0 && (
                  <div className="text-center py-16">
                    <div className="text-4xl mb-4">👤</div>
                    <div className="text-foreground font-medium mb-2">没有找到相关作者</div>
                    <div className="text-sm" style={{ color: `rgba(232,234,246,0.4)` }}>换个关键词试试吧</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SearchPage;
