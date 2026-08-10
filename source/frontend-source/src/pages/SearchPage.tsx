import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Search, TrendingUp, Clock, X, Hash, FileText, User } from "lucide-react";
import BlogCard, { BlogPost } from "../components/blog/BlogCard";
import GlassBackground from "../components/layout/GlassBackground";
import Navbar from "../components/layout/Navbar";
import { useAuth } from "../components/auth/AuthProvider";
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
  const { isLoggedIn, logout } = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BlogPost[]>([]);
  const [recentSearches, setRecentSearches] = useState(["React 19 新特性", "前端架构设计"]);
  const [activeTab, setActiveTab] = useState<"posts" | "tags" | "authors">("posts");
  const [hasSearched, setHasSearched] = useState(false);
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

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div data-cmp="SearchPage" className="min-h-screen relative">
      <GlassBackground />
      <Navbar isLoggedIn={isLoggedIn} onLogout={handleLogout} onLogin={() => navigate(`/login`)} />

      <div className="relative z-10" style={{ paddingTop: 64 }}>
        <div className="mx-auto px-6 py-12" style={{ maxWidth: 900 }}>
          {/* Search header */}
          <div className="text-center mb-10">
            <h1 className="text-4xl font-black text-[var(--foreground)] mb-3">探索一切</h1>
            <p className="text-sm text-[var(--muted-foreground)]">搜索文章、标签、作者...</p>
          </div>

          {/* Search bar */}
          <form onSubmit={handleSubmit} className="relative mb-10">
            <div className="flex items-center gap-3 px-5 py-4 rounded-2xl border border-[var(--border)] bg-[var(--card)]">
              <Search size={20} className="text-[var(--muted-foreground)] flex-shrink-0" />
              <input
                ref={inputRef}
                type="text"
                placeholder="搜索文章、标签或作者..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1 bg-transparent text-[var(--foreground)] outline-none text-base"
                style={{ caretColor: `var(--foreground)` }}
              />
              <div className={query ? `` : `hidden`}>
                <button
                  type="button"
                  onClick={() => { setQuery(``); setHasSearched(false); inputRef.current?.focus(); }}
                  className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-[var(--brand-subtle)] transition-colors"
                >
                  <X size={14} className="text-[var(--muted-foreground)]" />
                </button>
              </div>
              <button
                type="submit"
                className="btn-primary px-5 py-2 rounded-xl text-sm font-semibold flex-shrink-0"
              >
                搜索
              </button>
            </div>
          </form>

          {/* Pre-search state */}
          <div className={hasSearched ? `hidden` : ``}>
            {/* Recent searches */}
            <div className={recentSearches.length > 0 ? `mb-8` : `hidden`}>
              <h3 className="text-sm font-semibold text-[var(--foreground)] mb-4 flex items-center gap-2">
                <Clock size={14} className="text-[var(--muted-foreground)]" />
                最近搜索
              </h3>
              <div className="flex flex-wrap gap-2">
                {recentSearches.map((term) => (
                  <div
                    key={term}
                    onClick={() => handleQuickSearch(term)}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer transition-all group bg-[var(--muted)] border border-[var(--border)]"
                  >
                    <span className="text-sm text-[var(--muted-foreground)]">{term}</span>
                    <button onClick={(e) => removeRecent(term, e)} className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <X size={12} className="text-[var(--muted-foreground)]" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Hot searches */}
            <div className="mb-10">
              <h3 className="text-sm font-semibold text-[var(--foreground)] mb-4 flex items-center gap-2">
                <TrendingUp size={14} className="text-[var(--muted-foreground)]" />
                热门搜索
              </h3>
              <div className="flex flex-wrap gap-2">
                {hotSearches.map((term, i) => (
                  <button
                    key={term}
                    onClick={() => handleQuickSearch(term)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm transition-all bg-[var(--muted)] border border-[var(--border)] text-[var(--muted-foreground)]"
                  >
                    <span className={`text-xs font-bold w-4 ${i < 3 ? "text-[var(--foreground)]" : "text-[var(--muted-foreground)]"}`}>
                      {String(i + 1).padStart(2, `0`)}
                    </span>
                    {term}
                  </button>
                ))}
              </div>
            </div>

            {/* Hot tags */}
            <div>
              <h3 className="text-sm font-semibold text-[var(--foreground)] mb-4 flex items-center gap-2">
                <Hash size={14} className="text-[var(--muted-foreground)]" />
                热门标签
              </h3>
              <div className="flex flex-wrap gap-2">
                {hotTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => handleQuickSearch(tag)}
                    className="tag"
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
              <div className="text-sm text-[var(--muted-foreground)]">
                <span>搜索 "</span>
                <span className="text-[var(--foreground)]">{query}</span>
                <span>" 找到 {results.length} 个结果</span>
              </div>

              {/* Tabs */}
              <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--muted)]">
                {([
                  { key: `posts` as const, label: `文章`, icon: FileText },
                  { key: `tags` as const, label: `标签`, icon: Hash },
                  { key: `authors` as const, label: `作者`, icon: User },
                ]).map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all ${
                      activeTab === tab.key
                        ? "bg-[var(--brand-subtle)] text-[var(--foreground)]"
                        : "text-[var(--muted-foreground)]"
                    }`}
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
                <div className="text-[var(--foreground)] font-medium mb-2">没有找到相关文章</div>
                <div className="text-sm text-[var(--muted-foreground)]">换个关键词试试吧</div>
              </div>
            </div>

            {/* Tags results */}
            <div className={activeTab === `tags` ? `` : `hidden`}>
              <div className="flex flex-wrap gap-3">
                {matchedTags.map((tag) => (
                  <div
                    key={tag}
                    className="card px-5 py-4 flex items-center gap-3 cursor-pointer hover:bg-[var(--brand-subtle)] transition-all"
                    onClick={() => handleQuickSearch(tag)}
                  >
                    <Hash size={16} className="text-[var(--muted-foreground)]" />
                    <div>
                      <div className="text-sm font-semibold text-[var(--foreground)]">{tag}</div>
                      <div className="text-xs text-[var(--muted-foreground)]">
                        标签
                      </div>
                    </div>
                  </div>
                ))}
                {matchedTags.length === 0 && (
                  <div className="text-center py-16 w-full">
                    <div className="text-4xl mb-4">🏷️</div>
                    <div className="text-[var(--foreground)] font-medium mb-2">没有找到相关标签</div>
                    <div className="text-sm text-[var(--muted-foreground)]">换个关键词试试吧</div>
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
                    className="card p-4 flex items-center gap-4 cursor-pointer hover:bg-[var(--brand-subtle)] transition-all"
                    onClick={() => navigate(`/profile/${encodeURIComponent(author.name)}`)}
                  >
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-sm flex-shrink-0 bg-[var(--foreground)] text-[var(--background)]"
                    >
                      {author.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-sm text-[var(--foreground)]">{author.name}</div>
                      <div className="text-xs text-[var(--muted-foreground)]">{author.count} 篇文章</div>
                    </div>
                    <button
                      className="px-4 py-2 rounded-xl text-xs font-medium bg-[var(--brand-subtle)] text-[var(--foreground)] border border-[var(--border)]"
                    >
                      查看
                    </button>
                  </div>
                ))}
                {matchedAuthors.length === 0 && (
                  <div className="text-center py-16">
                    <div className="text-4xl mb-4">👤</div>
                    <div className="text-[var(--foreground)] font-medium mb-2">没有找到相关作者</div>
                    <div className="text-sm text-[var(--muted-foreground)]">换个关键词试试吧</div>
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
