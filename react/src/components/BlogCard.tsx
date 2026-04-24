import { Heart, MessageCircle, Eye, Bookmark, Clock, Share2 } from "lucide-react";
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
  post: BlogPost;
  variant?: "default" | "featured" | "compact";
}

const BlogCard = ({ post, variant = "default" }: BlogCardProps) => {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate(`/post?id=${post.id}`);
  };

  if (variant === "featured") {
    return (
      <div
        data-cmp="BlogCard"
        onClick={handleClick}
        className="glass-card group overflow-hidden cursor-pointer relative"
      >
        <div className="flex flex-col md:flex-row h-full">
          <div className="md:w-3/5 relative overflow-hidden aspect-video md:aspect-auto">
            <img
              src={post.cover}
              alt={post.title}
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
            />
            <div className="absolute inset-0 bg-linear-to-t from-black/60 to-transparent md:bg-linear-to-r md:from-transparent md:to-black/20" />
            <div className="absolute top-4 left-4">
              <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-[var(--primary)] text-white shadow-lg animate-pulse-glow">
                Featured
              </span>
            </div>
          </div>
          
          <div className="md:w-2/5 p-8 flex flex-col justify-center">
            <div className="flex gap-2 mb-4">
              {post.tags.slice(0, 2).map((tag) => (
                <span key={tag} className="tag-glass">{tag}</span>
              ))}
            </div>
            
            <h2 className="text-2xl md:text-3xl font-black mb-4 leading-tight group-hover:text-[var(--primary)] transition-colors">
              {post.title}
            </h2>
            
            <p className="text-foreground/50 text-sm mb-6 line-clamp-3 leading-relaxed">
              {post.excerpt}
            </p>
            
            <div className="flex items-center justify-between mt-auto pt-6 border-t border-white/5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-linear-to-br from-[var(--primary)] to-pink-500 flex items-center justify-center text-white font-bold shadow-lg">
                  {post.authorAvatar}
                </div>
                <div>
                  <div className="text-sm font-bold">{post.author}</div>
                  <div className="text-[10px] text-foreground/40">{post.date} · {post.readTime} min</div>
                </div>
              </div>
              
              <div className="flex items-center gap-4 text-foreground/40">
                <div className="flex items-center gap-1.5 hover:text-pink-500 transition-colors">
                  <Heart size={16} />
                  <span className="text-xs font-medium">{post.likes}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <MessageCircle size={16} />
                  <span className="text-xs font-medium">{post.comments}</span>
                </div>
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
        className="flex items-center gap-4 p-3 rounded-2xl cursor-pointer hover:bg-white/5 transition-all border border-transparent hover:border-white/5"
      >
        <div className="w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 relative group">
          <img
            src={post.cover}
            alt={post.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
          />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-bold leading-snug mb-1 truncate group-hover:text-[var(--primary)] transition-colors">
            {post.title}
          </h4>
          <div className="flex items-center gap-3 text-[10px] text-foreground/40">
            <span className="font-medium text-foreground/60">{post.author}</span>
            <span className="flex items-center gap-1"><Eye size={10} />{post.views}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      data-cmp="BlogCard"
      onClick={handleClick}
      className="glass-card group flex flex-col h-full cursor-pointer overflow-hidden"
    >
      <div className="relative overflow-hidden aspect-video">
        <img
          src={post.cover}
          alt={post.title}
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
        />
        <div className="absolute inset-0 bg-linear-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        
        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-300">
          <button
            onClick={(e) => { e.stopPropagation(); }}
            className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white hover:bg-[var(--primary)] transition-colors"
          >
            <Bookmark size={16} />
          </button>
        </div>
        
        <div className="absolute bottom-3 left-3 flex gap-1.5">
          {post.tags.slice(0, 2).map(tag => (
            <span key={tag} className="px-2 py-0.5 rounded-lg bg-black/40 backdrop-blur-md border border-white/10 text-[10px] text-white">
              {tag}
            </span>
          ))}
        </div>
      </div>

      <div className="p-6 flex flex-col flex-1">
        <h3 className="text-lg font-bold leading-tight mb-3 line-clamp-2 group-hover:text-[var(--primary)] transition-colors">
          {post.title}
        </h3>
        <p className="text-foreground/40 text-xs leading-relaxed mb-6 line-clamp-2">
          {post.excerpt}
        </p>

        <div className="flex items-center justify-between mt-auto">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-linear-to-br from-[var(--primary)] to-sky-400 flex items-center justify-center text-white text-[10px] font-bold">
              {post.authorAvatar}
            </div>
            <div>
              <div className="text-xs font-bold">{post.author}</div>
              <div className="text-[10px] text-foreground/30">{post.date}</div>
            </div>
          </div>

          <div className="flex items-center gap-3 text-foreground/30">
            <div className="flex items-center gap-1 hover:text-pink-500 transition-colors">
              <Heart size={14} />
              <span className="text-[10px] font-bold">{post.likes}</span>
            </div>
            <div className="flex items-center gap-1">
              <MessageCircle size={14} />
              <span className="text-[10px] font-bold">{post.comments}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BlogCard;
