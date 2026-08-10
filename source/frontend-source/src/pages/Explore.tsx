import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Search, TrendingUp, Grid, List, SlidersHorizontal } from "lucide-react";
import BlogCard, { BlogPost } from "../components/blog/BlogCard";
import GlassBackground from "../components/layout/GlassBackground";
import Navbar from "../components/layout/Navbar";
import { useAuth } from "../components/auth/AuthProvider";
import { postsApi, searchApi, tagsApi, type ApiPost, type ApiTag } from "../lib/api";

// 默认分类Tab，实际渲染时会优先使用后端返回的标签列表
const defaultTabs = [`全部`, `技术`, `设计`, `AI`, `工程化`];
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
  const { isLoggedIn, logout } = useAuth();
  const [searchVal, setSearchVal] = useState("");
  const [activeTab, setActiveTab] = useState("全部");
  const [sortBy, setSortBy] = useState("最新");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showFilter, setShowFilter] = useState(false);
  const [apiPosts, setApiPosts] = useState<ApiPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const PAGE_SIZE = 20;

  // @cuiruoni+从后端动态获取标签列表，构建分类Tab
  const [apiTags, setApiTags] = useState<ApiTag[]>([]);
  const [tabs, setTabs] = useState<string[]>(defaultTabs);

  useEffect(() => {
    tagsApi.list().then((tags) => {
      setApiTags(tags);
      if (tags.length > 0) {
        // @cuiruoni+动态生成分类Tab：全部 + 各标签名
        setTabs(["全部", ...tags.map((t) => t.name)]);
      }
    }).catch(() => {
      // 降级使用默认分类
    });
  }, []);

  const fetchPosts = async (pageNum: number = 1, append: boolean = false) => {
    setLoading(true);

    // @cuiruoni+如果选中了某个标签分类，使用标签API获取该标签下的文章
    if (activeTab !== "全部") {
      const matchedTag = apiTags.find((t) => t.name === activeTab);
      if (matchedTag) {
        try {
          const data = await tagsApi.posts(matchedTag.id);
          const mapped = data.map((p: any) => ({
            ...p,
            excerpt: p.excerpt ?? p.summary ?? "",
            author: p.author ?? "Unknown",
            likes: p.likes ?? 0,
            comments_count: p.comments_count ?? 0,
            views: p.views ?? p.view_count ?? 0,
            tags: p.tags ?? [],
          }));
          setApiPosts(mapped);
          setHasMore(false);
          setLoading(false);
          return;
        } catch {
          // 标签API失败，降级到全量筛选
        }
      }
    }

    const data = await postsApi.list(pageNum, PAGE_SIZE);
    if (append) {
      setApiPosts((prev) => [...prev, ...data]);
    } else {
      setApiPosts(data);
    }
    setHasMore(data.length >= PAGE_SIZE);
    setLoading(false);
  };

  /* Fetch posts from API on mount and when tab changes */
  useEffect(() => {
    setPage(1);
    fetchPosts(1);
  }, [activeTab]);

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

  // @cuiruoni+排序逻辑：按最新(id降序)、最热门(likes降序)、最多阅读(views降序)排序
  // 分类筛选已在fetchPosts中通过标签API完成，此处仅做排序
  const sorted = [...blogPosts].sort((a, b) => {
    if (sortBy === `最热门`) return b.likes - a.likes;
    if (sortBy === `最多阅读`) return b.views - a.views;
    return b.id - a.id;
  });

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div data-cmp="Explore" className="min-h-screen relative">
      <GlassBackground />
      <Navbar isLoggedIn={isLoggedIn} onLogout={handleLogout} onLogin={() => navigate(`/login`)} />

      <div className="relative z-10 pt-16">
        {/* Hero banner */}
        <div className="py-14 text-center bg-gradient-to-b from-foreground/[0.03] to-transparent border-b border-foreground/[0.06]">
          <div className="mx-auto px-6 max-w-[1440px]">
            <h1 className="text-4xl font-black text-foreground mb-3 font-[family-name:var(--font-display)]">
              <TrendingUp size={28} className="inline mr-3 mb-1 text-[var(--primary)]" />
              Discover
            </h1>
            <p className="text-base mb-8 text-foreground/55">
              Explore quality articles and insights from creators worldwide
            </p>

            {/* Search bar */}
            <div className="max-w-xl mx-auto relative">
              <Search
                size={18}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-foreground/35"
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
        <div className="mx-auto px-6 py-8 max-w-[1440px]">
          {/* Toolbar */}
          <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
            <div className="flex items-center gap-2 flex-wrap">
              {tabs.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all border ${
                    activeTab === tab
                      ? "bg-[var(--brand-subtle)] text-[var(--foreground)] border-[var(--brand-border)]"
                      : "bg-[var(--muted)] text-[var(--muted-foreground)] border-[var(--border)]"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <div className="relative">
                <button
                  onClick={() => setShowFilter(!showFilter)}
                  className="btn-ghost flex items-center gap-2 px-4 py-2 rounded-xl text-sm"
                >
                  <SlidersHorizontal size={15} />
                  {sortBy}
                </button>
                <div
                  className={`absolute right-0 top-12 w-40 bento-card overflow-hidden z-50 transition-all duration-200 ${
                    showFilter
                      ? "opacity-100 translate-y-0 pointer-events-auto"
                      : "opacity-0 -translate-y-1.5 pointer-events-none"
                  }`}
                >
                  {sortOptions.map((opt) => (
                    <button
                      key={opt}
                      onClick={() => { setSortBy(opt); setShowFilter(false); }}
                      className={`w-full text-left px-4 py-3 text-sm transition-colors hover:bg-foreground/5 ${
                        sortBy === opt ? "text-[var(--primary)]" : "text-[var(--muted-foreground)]"
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
                <div
                  className={`fixed inset-0 z-[-1] ${showFilter ? "pointer-events-auto" : "pointer-events-none"}`}
                  onClick={() => setShowFilter(false)}
                />
              </div>

              <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--muted)]">
                <button
                  onClick={() => setViewMode(`grid`)}
                  className={`p-2 rounded-lg transition-all ${viewMode === `grid` ? "bg-[var(--brand-subtle)]" : ""}`}
                >
                  <Grid size={15} className={viewMode === `grid` ? "text-[var(--primary)]" : "text-[var(--muted-foreground)]"} />
                </button>
                <button
                  onClick={() => setViewMode(`list`)}
                  className={`p-2 rounded-lg transition-all ${viewMode === `list` ? "bg-[var(--brand-subtle)]" : ""}`}
                >
                  <List size={15} className={viewMode === `list` ? "text-[var(--primary)]" : "text-[var(--muted-foreground)]"} />
                </button>
              </div>
            </div>
          </div>

          <div className="mb-5 text-sm text-foreground/50">
            {loading ? "Loading..." : (
              <>Found <span className="text-[var(--primary)]">{sorted.length}</span> articles</>
            )}
          </div>

          {/* Post grid/list */}
          <div className={viewMode === `grid` ? `flex flex-wrap gap-5` : `flex flex-col gap-4`}>
            {sorted.map((post, i) => (
              <div
                key={post.id}
                className={`${
                  viewMode === `grid`
                    ? `w-[calc(33.33%-14px)] min-w-[280px]`
                    : `w-full`
                } animate-[slide-in-up_0.5s_ease_forwards] opacity-0`}
                style={{ animationDelay: `${i * 0.06}s` }}
              >
                <BlogCard post={post} variant={viewMode === `list` ? `compact` : `default`} />
              </div>
            ))}
          </div>

          <div className={sorted.length === 0 && !loading ? `` : `hidden`}>
            <div className="text-center py-20">
              <div className="text-4xl mb-4">🔍</div>
              <div className="text-foreground font-medium mb-2">No articles found</div>
              <div className="text-sm text-foreground/50">
                Try different keywords or categories
              </div>
            </div>
          </div>

          <div className={sorted.length > 0 && hasMore ? `text-center mt-10` : `hidden`}>
            <button
              onClick={handleLoadMore}
              disabled={loading}
              className="btn-ghost px-10 py-3.5 rounded-2xl text-sm font-medium disabled:opacity-50"
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
