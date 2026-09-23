/* PostCards.tsx — 场景 2 的文章卡片网格（**博客的真实数据**）
 *
 * 2026-09-21：场景 2 从「项目作品」改成「博客文章」。用户的要求是
 * 「不是跳转到博客，要在这个页面直接作为博客的展示」—— 所以这里接的是
 * `postsApi`，卡片点开是站内阅读弹窗，不跳 /home。
 *
 * 结构契约：复用 `.project-cards-grid` 与 `.project-card` 这一套（布局 / 悬停上浮 /
 * 键盘可达 / 离场动效全部免费拿到），文章特有的只有 `.post-card-meta` 一行。
 * 另建 `.post-card` 修饰类承载它，不往 showcase.css（生成产物）里加东西。
 *
 * 三种非正常态都必须有 UI：加载中（骨架）、失败（带重试）、空（还没有文章）。
 * 少了任何一个，用户看到的就是"一片空白"或"永久转圈"。
 */

import { useState } from "react";
import type { ApiPost } from "../../lib/api";
import { excerptFrom, readMinutes } from "../lib/markdown";

interface PostCardProps {
  post: ApiPost;
  onOpen: (p: ApiPost) => void;
}

const PostCard = ({ post: p, onOpen }: PostCardProps) => {
  const [imgFailed, setImgFailed] = useState(false);
  const cover = p.cover || `https://picsum.photos/seed/blog${p.id}/600/400`;
  const body = p.content_md ?? p.content ?? "";
  const date = p.created_at ? p.created_at.slice(0, 10) : "";

  return (
    <article
      className="project-card post-card"
      data-post-id={p.id}
      tabIndex={0}
      role="button"
      aria-label={`阅读文章：${p.title}`}
      onClick={() => onOpen(p)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(p);
        }
      }}
    >
      <div className="project-image-wrap">
        {imgFailed ? (
          <div className="project-card-image post-card-fallback" />
        ) : (
          <img
            className="project-card-image"
            src={cover}
            alt={p.title}
            loading="lazy"
            onError={() => setImgFailed(true)}
          />
        )}
      </div>
      <div className="project-card-info">
        <p className="post-card-meta">
          {date}
          {date ? " · " : ""}约 {readMinutes(body)} 分钟
          {p.views ? ` · ${p.views} 次阅读` : ""}
        </p>
        <h3 className="project-card-title">{p.title}</h3>
        <p className="project-card-description">
          {p.excerpt || p.summary || excerptFrom(body)}
        </p>
        <div className="project-tags">
          {(p.tags ?? []).slice(0, 3).map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
      </div>
    </article>
  );
};

interface PostCardsProps {
  posts: ApiPost[];
  /** 场景 2 离场动效：加 is-leaving 让卡片上移淡出 */
  leaving: boolean;
  /** 软翻页过渡：加 is-paging 让旧卡片淡出上移、新卡片从上方滑落进场 */
  paging?: boolean;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  onOpen: (p: ApiPost) => void;
}

const PostCards = ({ posts, leaving, paging = false, loading, error, onRetry, onOpen }: PostCardsProps) => {
  const gridClass =
    "project-cards-grid" + (leaving ? " is-leaving" : "") + (paging ? " is-paging" : "");

  if (loading) {
    return (
      <div className={gridClass} id="projectGrid" aria-busy="true">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="post-card is-skeleton" aria-hidden="true">
            <div className="project-image-wrap">
              <div className="project-card-image post-card-fallback" />
            </div>
            <div className="project-card-info">
              <span className="post-skeleton-line" />
              <span className="post-skeleton-line is-short" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className={gridClass} id="projectGrid">
        <div className="post-state">
          <p>文章加载失败</p>
          <button type="button" className="post-retry" onClick={onRetry}>
            重试
          </button>
        </div>
      </div>
    );
  }

  if (!posts.length) {
    return (
      <div className={gridClass} id="projectGrid">
        <div className="post-state">
          <p>还没有文章</p>
          <span className="post-state-hint">去「写点什么」那一屏写下第一篇</span>
        </div>
      </div>
    );
  }

  return (
    <div className={gridClass} id="projectGrid">
      {posts.map((p) => (
        <PostCard key={p.id} post={p} onOpen={onOpen} />
      ))}
    </div>
  );
};

export default PostCards;
