import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Edit2, Grid, Bookmark, Heart, TrendingUp,
  Users, FileText, Eye, Calendar, MapPin, Link2,
  Twitter, Github, Star, Award
} from "lucide-react";
import BlogCard, { BlogPost } from "../components/BlogCard";
import GlassBackground from "../components/GlassBackground";
import Navbar from "../components/Navbar";

const myPosts: BlogPost[] = [
  {
    id: 1, title: `探索现代前端架构的无限可能`, excerpt: `深入了解 React 19 的新特性，探讨构建高性能前端架构的方法。`,
    cover: `https://picsum.photos/seed/blog1/600/400`, author: `Nova Chen`, authorAvatar: `NC`, date: `2025-06-15`, readTime: 8, likes: 248, comments: 32, views: 3420, tags: [`React`, `架构`],
  },
  {
    id: 2, title: `CSS 液态玻璃效果完全指南`, excerpt: `全面掌握 Glassmorphism 设计语言，打造令人惊艳的 UI 界面效果。`,
    cover: `https://picsum.photos/seed/blog2/600/400`, author: `Nova Chen`, authorAvatar: `NC`, date: `2025-06-12`, readTime: 12, likes: 512, comments: 67, views: 8930, tags: [`CSS`, `设计`],
  },
  {
    id: 3, title: `TypeScript 类型体操深度解析`, excerpt: `条件类型、映射类型，掌握高级特性让代码更优雅。`,
    cover: `https://picsum.photos/seed/blog3/600/400`, author: `Nova Chen`, authorAvatar: `NC`, date: `2025-06-10`, readTime: 15, likes: 189, comments: 28, views: 4210, tags: [`TypeScript`],
  },
];

const bookmarkedPosts: BlogPost[] = [
  {
    id: 4, title: `AI 辅助编程的未来展望`, excerpt: `大模型如何改变软件开发模式的深度分析。`,
    cover: `https://picsum.photos/seed/blog4/600/400`, author: `Mia Liu`, authorAvatar: `ML`, date: `2025-06-08`, readTime: 10, likes: 673, comments: 94, views: 12500, tags: [`AI`],
  },
];

const stats = [
  { label: `文章`, value: `24`, icon: FileText, color: `#7c6aff` },
  { label: `总阅读量`, value: `128K`, icon: Eye, color: `#38bdf8` },
  { label: `粉丝`, value: `3,420`, icon: Users, color: `#f472b6` },
  { label: `获赞`, value: `8,940`, icon: Heart, color: `#f59e0b` },
];

const badges = [
  { name: `首篇文章`, icon: `📝`, color: `#7c6aff`, desc: `发布了第一篇文章` },
  { name: `人气作者`, icon: `🔥`, color: `#f472b6`, desc: `文章阅读量突破1K` },
  { name: `百赞作者`, icon: `💎`, color: `#38bdf8`, desc: `单篇获赞超过100` },
  { name: `持续创作`, icon: `⚡`, color: `#f59e0b`, desc: `连续30天发布文章` },
];

const tabOptions = [`我的文章`, `收藏`, `喜欢的`];

const Profile = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(`我的文章`);
  const [following, setFollowing] = useState(false);
  const [isLoggedIn] = useState(() => !!localStorage.getItem(`blog_logged_in`));
  const isOwn = isLoggedIn;

  const handleLogout = () => {
    localStorage.removeItem(`blog_logged_in`);
    navigate(`/login`);
  };

  const displayPosts = activeTab === `我的文章` ? myPosts : activeTab === `收藏` ? bookmarkedPosts : myPosts.slice(0, 2);

  return (
    <div data-cmp="Profile" className="min-h-screen relative">
      <GlassBackground showParticles={false} />
      <Navbar isLoggedIn={isLoggedIn} onLogout={handleLogout} onLogin={() => navigate(`/login`)} />

      <div className="relative z-10" style={{ paddingTop: 64 }}>
        {/* Profile banner */}
        <div
          className="h-52 relative overflow-hidden"
          style={{
            background: `linear-gradient(135deg, rgba(124,106,255,0.25) 0%, rgba(56,189,248,0.15) 50%, rgba(244,114,182,0.15) 100%)`,
            borderBottom: `1px solid rgba(255,255,255,0.06)`,
          }}
        >
          {/* Decorative orbs */}
          <div className="orb orb-purple" style={{ width: 300, height: 300, top: `-50%`, left: `10%`, opacity: 0.3 }} />
          <div className="orb orb-cyan" style={{ width: 200, height: 200, bottom: `-30%`, right: `20%`, opacity: 0.2 }} />
        </div>

        <div className="mx-auto px-6" style={{ maxWidth: 1440 }}>
          {/* Avatar + actions row */}
          <div className="flex items-end justify-between mb-6 -mt-16 relative z-10">
            <div className="flex items-end gap-5">
              {/* Avatar */}
              <div
                className="relative rounded-2xl overflow-hidden flex-shrink-0"
                style={{
                  width: 96, height: 96,
                  background: `linear-gradient(135deg, #7c6aff, #f472b6)`,
                  border: `3px solid rgba(5,8,22,0.9)`,
                  boxShadow: `0 8px 32px rgba(124,106,255,0.4)`,
                }}
              >
                <div className="w-full h-full flex items-center justify-center text-2xl font-black text-white">
                  NC
                </div>
                <div
                  className="absolute bottom-1 right-1 w-3 h-3 rounded-full"
                  style={{ background: `#34d399`, border: `2px solid rgba(5,8,22,0.9)` }}
                />
              </div>
              <div className="mb-2">
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-black text-foreground">Nova Chen</h1>
                  <span
                    className="px-2 py-0.5 rounded-full text-xs font-medium"
                    style={{ background: `rgba(124,106,255,0.15)`, color: `#a78bfa`, border: `1px solid rgba(124,106,255,0.25)` }}
                  >
                    ✦ Pro
                  </span>
                </div>
                <p className="text-sm" style={{ color: `rgba(232,234,246,0.5)` }}>@novachen</p>
              </div>
            </div>

            <div className="flex items-center gap-3 mb-2">
              <div className={isOwn ? `` : `hidden`}>
                <button
                  onClick={() => navigate(`/settings`)}
                  className="btn-ghost-glass flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm text-foreground"
                >
                  <Edit2 size={14} />
                  编辑资料
                </button>
              </div>
              <div className={isOwn ? `hidden` : ``}>
                <button
                  onClick={() => setFollowing(!following)}
                  className="px-5 py-2.5 rounded-xl text-sm font-medium transition-all"
                  style={{
                    background: following ? `rgba(255,255,255,0.05)` : `linear-gradient(135deg, #7c6aff, #38bdf8)`,
                    color: following ? `rgba(232,234,246,0.6)` : `white`,
                    border: following ? `1px solid rgba(255,255,255,0.08)` : `none`,
                  }}
                >
                  {following ? `已关注` : `关注`}
                </button>
              </div>
            </div>
          </div>

          {/* Bio & info */}
          <div className="mb-8">
            <p className="text-sm leading-relaxed mb-4 max-w-2xl" style={{ color: `rgba(232,234,246,0.7)` }}>
              前端工程师 / UI设计爱好者 / 开源贡献者。专注于 React 生态和现代 Web 技术，热爱探索前沿设计语言。
            </p>
            <div className="flex items-center gap-5 flex-wrap text-sm" style={{ color: `rgba(232,234,246,0.45)` }}>
              <span className="flex items-center gap-1.5"><MapPin size={13} />上海，中国</span>
              <span className="flex items-center gap-1.5"><Link2 size={13} />novachen.dev</span>
              <span className="flex items-center gap-1.5"><Calendar size={13} />2023年1月加入</span>
              <span className="flex items-center gap-1.5"><Twitter size={13} style={{ color: `#38bdf8` }} />@novachen_dev</span>
              <span className="flex items-center gap-1.5"><Github size={13} />novachen</span>
            </div>
          </div>

          {/* Stats row */}
          <div className="flex gap-4 mb-8 flex-wrap">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="glass-card flex items-center gap-3 px-5 py-4"
                style={{ flex: `1 1 180px`, minWidth: 150 }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: `${stat.color}20`, border: `1px solid ${stat.color}30` }}
                >
                  <stat.icon size={18} style={{ color: stat.color }} />
                </div>
                <div>
                  <div className="text-xl font-black text-foreground">{stat.value}</div>
                  <div className="text-xs" style={{ color: `rgba(232,234,246,0.45)` }}>{stat.label}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-8">
            {/* Main posts area */}
            <div className="flex-1 min-w-0">
              {/* Tab nav */}
              <div className="flex items-center gap-1 mb-6">
                {tabOptions.map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className="px-5 py-2.5 rounded-xl text-sm font-medium transition-all"
                    style={{
                      background: activeTab === tab ? `rgba(124,106,255,0.15)` : `transparent`,
                      color: activeTab === tab ? `#a78bfa` : `rgba(232,234,246,0.55)`,
                      borderBottom: activeTab === tab ? `2px solid #7c6aff` : `2px solid transparent`,
                      borderRadius: 0,
                    }}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              <div className="flex flex-col gap-4 pb-12">
                {displayPosts.map((post, i) => (
                  <div
                    key={post.id}
                    style={{
                      animationDelay: `${i * 0.08}s`,
                      animation: `slide-in-up 0.5s ease forwards`,
                      opacity: 0,
                    }}
                  >
                    <BlogCard post={post} variant="compact" />
                  </div>
                ))}
              </div>
            </div>

            {/* Right sidebar */}
            <div className="hidden lg:block flex-shrink-0" style={{ width: 280 }}>
              {/* Badges */}
              <div className="glass-card p-5 mb-4">
                <div className="flex items-center gap-2 mb-4 text-sm font-semibold text-foreground">
                  <Award size={15} style={{ color: `#f59e0b` }} />
                  成就徽章
                </div>
                <div className="flex flex-wrap gap-3">
                  {badges.map((badge) => (
                    <div
                      key={badge.name}
                      className="flex flex-col items-center gap-1 p-3 rounded-xl cursor-pointer group transition-all"
                      style={{
                        background: `rgba(255,255,255,0.03)`,
                        border: `1px solid rgba(255,255,255,0.07)`,
                        flex: `1 1 80px`,
                        minWidth: 70,
                      }}
                      title={badge.desc}
                    >
                      <span className="text-2xl">{badge.icon}</span>
                      <span className="text-xs text-center leading-tight" style={{ color: `rgba(232,234,246,0.6)` }}>{badge.name}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Following/Followers */}
              <div className="glass-card p-5 mb-4">
                <div className="flex items-center gap-2 mb-4 text-sm font-semibold text-foreground">
                  <Users size={15} style={{ color: `#38bdf8` }} />
                  关注关系
                </div>
                <div className="flex gap-4 mb-4">
                  <div className="text-center flex-1">
                    <div className="text-xl font-black text-foreground">3,420</div>
                    <div className="text-xs mt-0.5" style={{ color: `rgba(232,234,246,0.4)` }}>粉丝</div>
                  </div>
                  <div className="w-px" style={{ background: `rgba(255,255,255,0.06)` }} />
                  <div className="text-center flex-1">
                    <div className="text-xl font-black text-foreground">218</div>
                    <div className="text-xs mt-0.5" style={{ color: `rgba(232,234,246,0.4)` }}>关注</div>
                  </div>
                </div>
                <div className="flex gap-2">
                  {[
                    { name: `LP`, color: `#38bdf8, #7c6aff` },
                    { name: `KZ`, color: `#f472b6, #7c6aff` },
                    { name: `ML`, color: `#f59e0b, #f472b6` },
                    { name: `AW`, color: `#34d399, #38bdf8` },
                  ].map((u) => (
                    <div
                      key={u.name}
                      className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold cursor-pointer"
                      style={{ background: `linear-gradient(135deg, ${u.color})` }}
                    >
                      {u.name}
                    </div>
                  ))}
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center text-xs cursor-pointer"
                    style={{ background: `rgba(255,255,255,0.06)`, color: `rgba(232,234,246,0.5)` }}
                  >
                    +
                  </div>
                </div>
              </div>

              {/* Trending posts */}
              <div className="glass-card p-5">
                <div className="flex items-center gap-2 mb-4 text-sm font-semibold text-foreground">
                  <Star size={15} style={{ color: `#f59e0b` }} />
                  最受欢迎
                </div>
                {myPosts.map((post, i) => (
                  <div key={post.id} className="flex items-start gap-3 py-2.5 group cursor-pointer" onClick={() => navigate(`/post`)}>
                    <span className="text-xs font-black flex-shrink-0 mt-0.5" style={{ color: i < 2 ? `#7c6aff` : `rgba(232,234,246,0.3)` }}>
                      {String(i + 1).padStart(2, `0`)}
                    </span>
                    <div>
                      <p className="text-xs leading-snug group-hover:text-purple-300 transition-colors" style={{ color: `rgba(232,234,246,0.75)` }}>
                        {post.title}
                      </p>
                      <span className="flex items-center gap-2 mt-0.5 text-xs" style={{ color: `rgba(232,234,246,0.35)` }}>
                        <Heart size={10} />
                        {post.likes}
                        <Eye size={10} />
                        {post.views.toLocaleString()}
                      </span>
                    </div>
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

export default Profile;
