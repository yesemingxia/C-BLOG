import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Search, TrendingUp, Grid, List, SlidersHorizontal } from "lucide-react";
import BlogCard, { BlogPost } from "../components/BlogCard";
import GlassBackground from "../components/GlassBackground";
import Navbar from "../components/Navbar";
import { postsApi, searchApi, type ApiPost } from "../lib/api";

const tabs = [`全部`, `技术`, `设计`, `AI`, `工程化`];
const sortOptions = [`最新`, `最热门`, `最多阅读`];

/* Convert API post to BlogCard formats */
// @cuiruoni+API数据格式转换：将后端ApiPost结构映射为BlogCard所需的BlogPost格式，填充默认值
function toBlogPost(p: ApiPost): BlogPost {
  return {
    id: p.id,
    title: p.title,
    excerpt: p.excerpt ?? "",
    cover: `https://picsum.photos/seed/blog${p.id}/600/400`,
    author: p.author ?? "Unknown",
    authorAvatar: (p.author ?? "U").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase(),
    date: p.created_at?.slice(0, 10) ?? "",
    readTime: Math.max(5, Math.round((p.content?.length ?? 500) / 200)),
    likes: p.likes ?? 0,
    comments: p.comments_count ?? 0,
    views: p.views ?? 0,
    tags: p.tags ?? [],
  };
}

// @cuiruoni+探索页组件：API数据获取+搜索防抖+分类筛选+排序+网格/列表视图切换
const Explore = () => {
  const navigate = useNavigate();
  const [searchVal, setSearchVal] = useState(``);
  const [activeTab, setActiveTab] = useState(`全部`);
  const [sortBy, setSortBy] = useState(`最新`);
  // @cuiruoni+视图模式切换：grid(卡片网格)和list(紧凑列表)两种展示方式
  const [viewMode, setViewMode] = useState<`grid` | `list`>(`grid`);
  const [showFilter, setShowFilter] = useState(false);
  const [isLoggedIn] = useState(() => !!localStorage.getItem(`blog_logged_in`));
  const [apiPosts, setApiPosts] = useState<ApiPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const PAGE_SIZE = 20;

  const fetchPosts = async (pageNum: number = 1, append: boolean = false) => {
    setLoading(true);
    const data = await postsApi.list(pageNum, PAGE_SIZE);
    if (append) {
      setApiPosts((prev) => [...prev, ...data]);
    } else {
      setApiPosts(data);
    }
    setHasMore(data.length >= PAGE_SIZE);
    setLoading(false);
  };

  /* Fetch posts from API on mount */
  useEffect(() => {
    fetchPosts(1);
  }, []);

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchPosts(nextPage, true);
  };

  /* Search from API when user types */
  // @cuiruoni+搜索防抖：400ms延迟后发起搜索请求，避免每次按键都调用API
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!searchVal.trim()) {
        setPage(1);
        fetchPosts(1);
        return;
      }
      setLoading(true);
      const results = await searchApi.search(searchVal);
      setApiPosts(results);
      setHasMore(false);
      setLoading(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchVal]);

  const blogPosts = apiPosts.map(toBlogPost);

  // @cuiruoni+分类筛选逻辑：根据标签名匹配不同分类，支持多标签归类
  const filtered = blogPosts.filter((p) => {
    const matchTab = activeTab === `全部` ||
      (activeTab === `技术` && p.tags.some((t) => [`React`, `TypeScript`, `Rust`, `微前端`].includes(t))) ||
      (activeTab === `设计` && p.tags.some((t) => [`设计`, `UI`, `CSS`, `设计系统`].includes(t))) ||
      (activeTab === `AI` && p.tags.some((t) => [`AI`].includes(t))) ||
      (activeTab === `工程化` && p.tags.some((t) => [`DevOps`, `Docker`, `架构`, `全栈`, `Next.js`].includes(t)));
    return matchTab;
  });

  // @cuiruoni+排序逻辑：按最新(id降序)、最热门(likes降序)、最多阅读(views降序)排序
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
            <h1 className="text-4xl font-black text-foreground mb-3" style={{ fontFamily: 'var(--font-display)' }}>
              <TrendingUp size={28} className="inline mr-3 mb-1" style={{ color: `#7c6aff` }} />
              Discover
            </h1>
            <p className="text-base mb-8" style={{ color: `rgba(232,234,246,0.55)` }}>
              Explore quality articles and insights from creators worldwide
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
                placeholder="Search articles, tags, authors..."
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
                  className="absolute right-0 top-12 w-40 bento-card rounded-xl overflow-hidden"
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

          <div className="mb-5 text-sm" style={{ color: `rgba(232,234,246,0.4)` }}>
            {loading ? "Loading..." : (
              <>Found <span style={{ color: `#a78bfa` }}>{sorted.length}</span> articles</>
            )}
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

          <div className={sorted.length === 0 && !loading ? `` : `hidden`}>
            <div className="text-center py-20">
              <div className="text-4xl mb-4">🔍</div>
              <div className="text-foreground font-medium mb-2">No articles found</div>
              <div className="text-sm" style={{ color: `rgba(232,234,246,0.4)` }}>
                Try different keywords or categories
              </div>
            </div>
          </div>

          <div className={sorted.length > 0 && hasMore ? `text-center mt-10` : `hidden`}>
            <button
              onClick={handleLoadMore}
              disabled={loading}
              className="btn-ghost-glass px-10 py-3.5 rounded-2xl text-sm font-medium text-foreground"
              style={{ opacity: loading ? 0.5 : 1 }}
            >
              {loading ? `加载中...` : `Load More`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Explore;
