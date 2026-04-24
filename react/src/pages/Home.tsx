import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  TrendingUp, Flame, Star, ChevronRight,
  ArrowRight, Rss, Hash, Sparkles, Zap
} from "lucide-react";
import BlogCard, { BlogPost } from "../components/BlogCard";
import MainLayout from "../components/MainLayout";

const posts: BlogPost[] = [
  {
    id: 1,
    title: `探索现代前端架构的无限可能`,
    excerpt: `深入了解 React 19 的新特性，探讨如何在大型项目中构建高性能、可维护的前端架构体系。`,
    cover: `https://images.unsplash.com/photo-1633356122544-f134324a6cee?auto=format&fit=crop&q=80&w=800`,
    author: `Nova Chen`,
    authorAvatar: `NC`,
    date: `2025-06-15`,
    readTime: 8,
    likes: 248,
    comments: 32,
    views: 3420,
    tags: [`React`, `架构`, `前端`],
    featured: true,
  },
  {
    id: 2,
    title: `CSS 液态玻璃效果完全指南`,
    excerpt: `从原理到实践，全面掌握 Glassmorphism 设计语言，打造令人惊惊艳的 UI 界面效果。`,
    cover: `https://images.unsplash.com/photo-1550684848-fac1c5b4e853?auto=format&fit=crop&q=80&w=800`,
    author: `Luna Park`,
    authorAvatar: `LP`,
    date: `2025-06-12`,
    readTime: 12,
    likes: 512,
    comments: 67,
    views: 8930,
    tags: [`CSS`, `设计`, `UI`],
  },
  {
    id: 3,
    title: `TypeScript 5.0 类型体操深度解析`,
    excerpt: `条件类型、映射类型、模板字面量类型，掌握这些高级特性让你的代码更加优雅健壮。`,
    cover: `https://images.unsplash.com/photo-1516116216624-53e697fedbea?auto=format&fit=crop&q=80&w=800`,
    author: `Kai Zhao`,
    authorAvatar: `KZ`,
    date: `2025-06-10`,
    readTime: 15,
    likes: 189,
    comments: 28,
    views: 4210,
    tags: [`TypeScript`, `编程`],
  },
  {
    id: 4,
    title: `AI 辅助编程的未来展望`,
    excerpt: `GPT-4o、Claude 3.5 Sonnet 等大模型如何改变软件开发模式，以及开发者的应对策略。`,
    cover: `https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&q=80&w=800`,
    author: `Mia Liu`,
    authorAvatar: `ML`,
    date: `2025-06-08`,
    readTime: 10,
    likes: 673,
    comments: 94,
    views: 12500,
    tags: [`AI`, `未来`, `开发`],
  },
];

const categories = [
  { name: `技术`, count: 128, color: `#6366f1`, icon: <Zap size={14} /> },
  { name: `设计`, count: 64, color: `#38bdf8`, icon: `🎨` },
  { name: `AI / ML`, count: 89, color: `#f472b6`, icon: `🤖` },
  { name: `生活`, count: 45, color: `#34d399`, icon: `🌿` },
];

const Home = () => {
  const navigate = useNavigate();
  const [activeCategory, setActiveCategory] = useState(`全部`);
  const isLoggedIn = !!localStorage.getItem(`blog_logged_in`);

  return (
    <MainLayout>
      <div className="mx-auto px-6 max-w-[1440px]">
        {/* Hero Section */}
        <div className="py-20 md:py-32 flex flex-col items-center text-center relative">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-8 text-xs font-bold tracking-widest uppercase bg-[var(--primary)]/10 text-[var(--primary)] border border-[var(--primary)]/20 shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-1000">
            <Sparkles size={14} className="fill-[var(--primary)]/20" />
            Empowering Your Ideas
          </div>

          <h1 className="text-5xl md:text-7xl font-black tracking-tighter mb-8 leading-[0.9] animate-in fade-in slide-in-from-bottom-6 duration-1000 delay-100">
            用文字点亮<br />
            <span className="gradient-text">思想的宇宙</span>
          </h1>

          <p className="max-w-2xl text-lg md:text-xl text-foreground/50 mb-12 leading-relaxed animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-200">
            加入全球领先的创作者社区，分享您的技术见解、设计美学与人生思考。
            在这里，每一个灵感都值得被看见。
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-4 animate-in fade-in slide-in-from-bottom-10 duration-1000 delay-300">
            <button
              onClick={() => isLoggedIn ? navigate(`/write`) : navigate(`/login`)}
              className="btn-primary-glass px-10 py-4 rounded-2xl text-base font-black text-white flex items-center gap-3 group"
            >
              开始创作 
              <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
            </button>
            <button
              onClick={() => navigate(`/explore`)}
              className="btn-ghost-glass px-10 py-4 rounded-2xl text-base font-bold text-foreground/80 hover:text-foreground"
            >
              探索灵感
            </button>
          </div>

          {/* Featured Orbs */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -z-10 w-full max-w-4xl aspect-video opacity-40 blur-[120px] pointer-events-none">
             <div className="absolute top-0 left-0 w-64 h-64 bg-indigo-500 rounded-full animate-pulse" />
             <div className="absolute bottom-0 right-0 w-64 h-64 bg-sky-500 rounded-full animate-pulse" style={{ animationDelay: '2s' }} />
          </div>
        </div>

        {/* Content Section */}
        <div className="flex flex-col lg:flex-row gap-12 pb-32">
          {/* Left: Category Sidebar */}
          <aside className="lg:w-64 space-y-8">
            <div className="glass-card p-6">
              <h3 className="text-sm font-black uppercase tracking-widest text-foreground/30 mb-6 flex items-center gap-2">
                <Hash size={14} className="text-[var(--primary)]" />
                分类浏览
              </h3>
              <div className="space-y-1">
                {[{ name: `全部`, count: posts.length, icon: <Sparkles size={14} /> }, ...categories].map((cat) => (
                  <button
                    key={cat.name}
                    onClick={() => setActiveCategory(cat.name)}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                      activeCategory === cat.name 
                        ? "bg-[var(--primary)]/10 text-[var(--primary)] shadow-sm" 
                        : "text-foreground/40 hover:text-foreground hover:bg-white/5"
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      {cat.icon}
                      {cat.name}
                    </span>
                    <span className="text-[10px] opacity-40">{cat.count}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="glass-card p-6 bg-linear-to-br from-[var(--primary)]/10 to-transparent border-[var(--primary)]/10">
               <Rss size={24} className="text-[var(--primary)] mb-4" />
               <h4 className="font-bold mb-2">订阅周刊</h4>
               <p className="text-xs text-foreground/40 mb-4 leading-relaxed">每周获取最受关注的技术文章与设计灵感。</p>
               <button className="w-full py-2.5 rounded-xl bg-white text-black text-xs font-black hover:bg-white/90 transition-colors">
                 立即订阅
               </button>
            </div>
          </aside>

          {/* Center: Feed */}
          <div className="flex-1 space-y-10">
            {/* Featured Section */}
            <section>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-1 h-6 bg-[var(--primary)] rounded-full" />
                <h2 className="text-xl font-black">今日精选</h2>
              </div>
              <BlogCard post={posts[0]} variant="featured" />
            </section>

            {/* List Section */}
            <section>
              <div className="flex items-center justify-between mb-8 pt-4 border-t border-white/5">
                <div className="flex items-center gap-6">
                   {['最新', '热门', '关注'].map(tab => (
                     <button key={tab} className={`text-sm font-black transition-colors ${tab === '最新' ? 'text-foreground' : 'text-foreground/30 hover:text-foreground'}`}>
                       {tab}
                     </button>
                   ))}
                </div>
                <div className="text-[10px] font-bold text-foreground/30 uppercase tracking-widest">
                  Showing {posts.length} results
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {posts.slice(1).map((post, i) => (
                  <div key={post.id} className="animate-in fade-in slide-in-from-bottom-4 duration-700" style={{ animationDelay: `${i * 150}ms` }}>
                    <BlogCard post={post} />
                  </div>
                ))}
              </div>

              <div className="mt-16 flex justify-center">
                <button className="btn-ghost-glass px-12 py-4 rounded-2xl text-sm font-black group">
                  加载更多文章
                  <ChevronRight size={16} className="inline ml-2 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </section>
          </div>

          {/* Right: Trending */}
          <aside className="lg:w-80 space-y-8">
            <div className="glass-card p-6">
               <h3 className="text-sm font-black uppercase tracking-widest text-foreground/30 mb-6 flex items-center gap-2">
                 <TrendingUp size={14} className="text-pink-500" />
                 本周热门
               </h3>
               <div className="space-y-6">
                 {posts.map((post, i) => (
                   <div key={post.id} className="flex gap-4 group cursor-pointer" onClick={() => navigate(`/post`)}>
                     <span className="text-xl font-black text-foreground/10 group-hover:text-[var(--primary)]/20 transition-colors">
                       {(i + 1).toString().padStart(2, '0')}
                     </span>
                     <div>
                       <h4 className="text-sm font-bold leading-tight group-hover:text-[var(--primary)] transition-colors line-clamp-2">
                         {post.title}
                       </h4>
                       <p className="text-[10px] text-foreground/30 mt-1">{post.views.toLocaleString()} 阅读</p>
                     </div>
                   </div>
                 ))}
               </div>
            </div>

            <div className="glass-card p-6">
               <h3 className="text-sm font-black uppercase tracking-widest text-foreground/30 mb-4 flex items-center gap-2">
                 <Star size={14} className="text-amber-400" />
                 热门标签
               </h3>
               <div className="flex flex-wrap gap-2">
                 {['React', 'Web3', 'AI', 'UI', 'Rust', 'DevOps', 'Vite'].map(tag => (
                   <span key={tag} className="tag-glass cursor-pointer">
                     {tag}
                   </span>
                 ))}
               </div>
            </div>
          </aside>
        </div>
      </div>
    </MainLayout>
  );
};

export default Home;
