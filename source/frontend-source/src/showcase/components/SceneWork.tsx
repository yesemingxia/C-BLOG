/* SceneWork.tsx — 场景 2：文章列表（**博客的真实数据**）
 *
 * 2026-09-21 改造：原本是「项目作品」（`PROJECTS = []`，一片空态），
 * 现在换成后端文章 —— 用户要的是「不跳转到博客，在这个页面直接展示」。
 *
 * 布局沿用原来的 `.work-layout`（左 1/3 标题区 + 右 2/3 网格），只换内容。
 *
 * 2026-09-21 二次增强：补搜索与标签筛选（旧博客页删除后这两个能力一度失去入口）
 *   · 搜索框 —— 400ms 防抖走 /api/search
 *   · 标签 chips —— 单选，选中走 /api/tags/:id/posts；「全部」回到列表
 *   · 三种数据源互斥：搜索 > 标签 > 默认列表；空态用 PostCards 自带的
 *
 * 两条边界：
 *   · 数据在这层自己拉（自包含），`refreshToken` 由外层 +1 触发重拉 ——
 *     场景 3 发布成功后要让列表出现新文章，但不能把刷新逻辑塞进发布面板。
 *   · 选中态交给外层（Showcase）：`PostModal` 与 `ProjectModal` 一样必须 portal
 *     到 overlay 层，渲染位置在 Showcase，这里只负责把点击传出去。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { postsApi, searchApi, tagsApi, type ApiPost, type ApiTag } from "../../lib/api";
import PostCards from "./PostCards";

const PAGE_SIZE = 8;

interface SceneWorkProps {
  /** 离场动效开关，由 useSceneMachine 的 scene2Leaving 驱动 */
  leaving: boolean;
  /** 外层自增即触发重新拉取（发布成功后用） */
  refreshToken?: number;
  /** 点卡片：交给外层开阅读弹窗（要同时屏蔽场景导航） */
  onOpenPost: (p: ApiPost) => void;
}

const SceneWork = ({ leaving, refreshToken = 0, onOpenPost }: SceneWorkProps) => {
  const [posts, setPosts] = useState<ApiPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  /* 搜索与标签 */
  const [searchInput, setSearchInput] = useState("");
  const [searchVal, setSearchVal] = useState("");
  const [tags, setTags] = useState<ApiTag[]>([]);
  const [activeTagId, setActiveTagId] = useState<number | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* 分页（仅默认列表模式；搜索/标签模式展示全部结果） */
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  /* 翻页过渡：翻页时不闪骨架屏 —— 旧卡片先淡出（网格挂 is-paging），
     新数据渲染出一帧后再移除，卡片从上方滑落进场（"往下拉"的落位感）。
     softRef 是同步闸门：请求在途时忽略下一次翻页，动画不会被打断。 */
  const [softPaging, setSoftPaging] = useState(false);
  const softRef = useRef(false);

  const goToPage = (n: number) => {
    if (n === page || softRef.current) return;
    softRef.current = true;
    setSoftPaging(true);
    setPage(n);
  };

  /* 搜索框防抖 */
  const handleSearchInput = (v: string) => {
    setSearchInput(v);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setSearchVal(v.trim());
      setPage(1);
    }, 400);
  };

  const load = useCallback(async () => {
    /* 软翻页时不亮骨架屏：旧卡片留在原地播放淡出动画 */
    if (!softRef.current) setLoading(true);
    setError(false);
    try {
      // 数据源优先级：搜索 > 标签 > 默认列表（互斥，最近一次操作决定来源）
      if (searchVal) {
        const results = await searchApi.search(searchVal);
        setPosts(results);
      } else if (activeTagId !== null) {
        setPosts(await tagsApi.posts(activeTagId));
      } else {
        const { posts: list, total: t } = await postsApi.listPage(page, PAGE_SIZE);
        setPosts(list);
        setTotal(t);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      if (softRef.current) {
        /* 等新卡片真正渲染出一帧：先把网格滚回顶部（旧页可能滚在中途），
           再松开 is-paging → 触发滑落进场动画 */
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const grid = document.getElementById("projectGrid");
            if (grid) grid.scrollTop = 0;
            softRef.current = false;
            setSoftPaging(false);
          }),
        );
      }
    }
  }, [searchVal, activeTagId, page]);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  /* 标签列表拉一次；接口挂了就隐藏 chips（空数组自然不渲染） */
  useEffect(() => {
    tagsApi
      .list()
      .then(setTags)
      .catch(() => setTags([]));
  }, []);

  return (
    <section className="page page-work" aria-labelledby="work-title">
      <div className="work-layout">
        <div className="section-header">
          <p className="eyebrow">Articles</p>
          <h2 id="work-title">{searchVal ? `搜索：${searchVal}` : "最新文章"}</h2>
          <p className="section-subtitle">
            点开任意一篇即可阅读，不用离开这一屏。想写点什么就滑到旁边那一屏。
          </p>

          {/* 搜索框：样式沿用场景语言的玻璃输入 */}
          <div className="work-search">
            <Search size={14} className="work-search-icon" aria-hidden="true" />
            <input
              className="work-search-input"
              type="text"
              placeholder="搜索标题 / 内容…"
              value={searchInput}
              onChange={(e) => handleSearchInput(e.target.value)}
              aria-label="搜索文章"
            />
            {searchInput && (
              <button
                type="button"
                className="work-search-clear"
                aria-label="清空搜索"
                onClick={() => handleSearchInput("")}
              >
                ×
              </button>
            )}
          </div>

          {/* 标签 chips：单选筛选；有搜索词时暂时禁用（搜索优先） */}
          {tags.length > 0 && (
            <div className="work-tags" role="group" aria-label="按标签筛选">
              <button
                type="button"
                className={"work-tag" + (activeTagId === null && !searchVal ? " is-on" : "")}
                onClick={() => {
                  setActiveTagId(null);
                  handleSearchInput("");
                }}
              >
                全部
              </button>
              {tags.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={"work-tag" + (activeTagId === t.id ? " is-on" : "")}
                  onClick={() => {
                    handleSearchInput("");
                    setActiveTagId(activeTagId === t.id ? null : t.id);
                  }}
                >
                  {t.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <PostCards
          posts={posts}
          leaving={leaving}
          loading={loading}
          error={error}
          paging={softPaging}
          onRetry={load}
          onOpen={onOpenPost}
        />

        {/* 分页：仅默认列表模式显示（搜索/标签结果一次全出，不翻页） */}
        {!searchVal && activeTagId === null && totalPages > 1 && (
          <div className="work-pager">
            <button
              type="button"
              className="work-tag"
              disabled={page <= 1 || softPaging}
              onClick={() => goToPage(Math.max(1, page - 1))}
            >
              上一页
            </button>
            <span className="work-pager-info">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              className="work-tag"
              disabled={page >= totalPages || softPaging}
              onClick={() => goToPage(Math.min(totalPages, page + 1))}
            >
              下一页
            </button>
          </div>
        )}
      </div>
    </section>
  );
};

export default SceneWork;
