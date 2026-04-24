import { Heart, MessageCircle, Eye, Bookmark, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";

export interface BlogPost {
  id: number;
  title: string;
  excerpt: string;
  cover: string;
  author: string;
  authorAvatar: string;
  date: string;
  readTime: number;
  likes: number;
  comments: number;
  views: number;
  tags: string[];
  featured?: boolean;
}

interface BlogCardProps {
  post?: BlogPost;
  variant?: "default" | "featured" | "compact";
}

const defaultPost: BlogPost = {
  id: 1,
  title: `探索现代前端架构的无限可能`,
  excerpt: `深入了解 React 19 的新特性，探讨如何在大型项目中构建高性能、可维护的前端架构体系...`,
  cover: `https://picsum.photos/seed/blog1/600/400`,
  author: `Nova Chen`,
  authorAvatar: `NC`,
  date: `2025-06-15`,
  readTime: 8,
  likes: 248,
  comments: 32,
  views: 3420,
  tags: [`React`, `架构`, `前端`],
  featured: false,
};

const BlogCard = ({ post = defaultPost, variant = "default" }: BlogCardProps) => {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate(`/post`);
  };

  if (variant === "featured") {
    return (
      <div
        data-cmp="BlogCard"
        onClick={handleClick}
        className="glass-card overflow-hidden cursor-pointer group"
        style={{ animationDelay: `0.1s` }}
      >
        <div className="relative overflow-hidden" style={{ height: 280 }}>
          <img
            src={post.cover}
            alt={post.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(180deg, transparent 40%, rgba(5,8,22,0.95) 100%)`,
            }}
          />
          <div className="absolute top-4 left-4">
            <span
              className="px-3 py-1 rounded-full text-xs font-semibold"
              style={{
                background: `linear-gradient(135deg, rgba(124,106,255,0.8), rgba(56,189,248,0.6))`,
                color: `white`,
                backdropFilter: `blur(8px)`,
                border: `1px solid rgba(255,255,255,0.2)`,
              }}
            >
              精选
            </span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 p-6">
            <div className="flex gap-2 mb-3 flex-wrap">
              {post.tags.slice(0, 3).map((tag) => (
                <span key={tag} className="tag-glass">{tag}</span>
              ))}
            </div>
            <h2 className="text-xl font-bold text-foreground leading-tight mb-2">
              {post.title}
            </h2>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold"
                  style={{ background: `linear-gradient(135deg, #7c6aff, #f472b6)` }}
                >
                  {post.authorAvatar}
                </div>
                <span className="text-sm" style={{ color: `rgba(232,234,246,0.7)` }}>
                  {post.author}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs" style={{ color: `rgba(232,234,246,0.5)` }}>
                <span className="flex items-center gap-1"><Clock size={11} />{post.readTime} min</span>
                <span className="flex items-center gap-1"><Eye size={11} />{post.views}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <div
        data-cmp="BlogCard"
        onClick={handleClick}
        className="flex items-center gap-4 p-4 rounded-xl cursor-pointer transition-all"
        style={{
          background: `rgba(255,255,255,0.04)`,
          border: `1px solid rgba(255,255,255,0.07)`,
        }}
      >
        <img
          src={post.cover}
          alt={post.title}
          className="w-16 h-16 rounded-xl object-cover flex-shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="flex gap-1.5 mb-1 flex-wrap">
            {post.tags.slice(0, 2).map((tag) => (
              <span key={tag} className="tag-glass text-xs" style={{ padding: `2px 8px` }}>{tag}</span>
            ))}
          </div>
          <h4 className="text-sm font-semibold text-foreground leading-snug truncate">
            {post.title}
          </h4>
          <div className="flex items-center gap-3 mt-1 text-xs" style={{ color: `rgba(232,234,246,0.45)` }}>
            <span>{post.author}</span>
            <span className="flex items-center gap-1"><Heart size={10} />{post.likes}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      data-cmp="BlogCard"
      onClick={handleClick}
      className="glass-card overflow-hidden cursor-pointer group"
    >
      <div className="relative overflow-hidden" style={{ height: 200 }}>
        <img
          src={post.cover}
          alt={post.title}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div
          className="absolute inset-0"
          style={{ background: `linear-gradient(180deg, transparent 50%, rgba(5,8,22,0.8) 100%)` }}
        />
        <div className="absolute top-3 right-3">
          <button
            onClick={(e) => { e.stopPropagation(); }}
            className="w-8 h-8 rounded-xl flex items-center justify-center transition-all"
            style={{
              background: `rgba(5,8,22,0.6)`,
              backdropFilter: `blur(8px)`,
              border: `1px solid rgba(255,255,255,0.1)`,
            }}
          >
            <Bookmark size={14} style={{ color: `rgba(232,234,246,0.7)` }} />
          </button>
        </div>
      </div>

      <div className="p-5">
        <div className="flex gap-2 mb-3 flex-wrap">
          {post.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="tag-glass">{tag}</span>
          ))}
        </div>

        <h3 className="text-base font-bold text-foreground leading-snug mb-2 line-clamp-2">
          {post.title}
        </h3>
        <p className="text-sm leading-relaxed mb-4 line-clamp-2" style={{ color: `rgba(232,234,246,0.55)` }}>
          {post.excerpt}
        </p>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold"
              style={{ background: `linear-gradient(135deg, #38bdf8, #7c6aff)` }}
            >
              {post.authorAvatar}
            </div>
            <div>
              <div className="text-xs font-medium text-foreground">{post.author}</div>
              <div className="text-xs" style={{ color: `rgba(232,234,246,0.4)` }}>
                {post.date} · {post.readTime} min read
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs" style={{ color: `rgba(232,234,246,0.45)` }}>
            <span className="flex items-center gap-1 hover:text-pink-400 transition-colors cursor-pointer">
              <Heart size={13} />{post.likes}
            </span>
            <span className="flex items-center gap-1">
              <MessageCircle size={13} />{post.comments}
            </span>
            <span className="flex items-center gap-1">
              <Eye size={13} />{post.views}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BlogCard;
