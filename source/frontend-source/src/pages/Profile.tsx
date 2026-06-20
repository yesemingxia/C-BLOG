import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  FileText, Eye, Calendar, MapPin, Link2,
  Twitter, Star, Heart, Edit2
} from "lucide-react";
import BlogCard, { BlogPost } from "../components/blog/BlogCard";
import GlassBackground from "../components/layout/GlassBackground";
import Navbar from "../components/layout/Navbar";
import { useAuth } from "../components/auth/AuthProvider";
import { profileApi, type UserProfile, type ApiPost } from "../lib/api";

const tabOptions = [`我的文章`, `收藏`, `喜欢的`];

// @cuiruoni+个人主页组件：从后端API获取用户资料和文章列表
const Profile = () => {
  const navigate = useNavigate();
  const { username: routeUsername } = useParams<{ username?: string }>();
  const { isLoggedIn, user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState("我的文章");
  const [following, setFollowing] = useState(false);
  const [profile, setProfile] = useState<(UserProfile & { posts: BlogPost[] }) | null>(null);
  const [loading, setLoading] = useState(true);
  const isOwn = isLoggedIn && (!routeUsername || routeUsername === user?.username);

  // @cuiruoni+从后端API加载用户公开资料
  useEffect(() => {
    const loadProfile = async () => {
      setLoading(true);
      const uname = routeUsername || user?.username || "";
      if (!uname) { setLoading(false); return; }
      try {
        const data = await profileApi.getPublicProfile(uname);
        if (data) {
          const posts: BlogPost[] = (data.posts || []).map((p: ApiPost) => ({
            id: p.id,
            title: p.title,
            excerpt: p.excerpt ?? "",
            cover: p.cover ?? "",
            author: data.username,
            authorAvatar: data.username.slice(0, 2).toUpperCase(),
            date: p.created_at?.slice(0, 10) ?? "",
            readTime: 5,
            likes: p.likes ?? 0,
            comments: p.comments_count ?? 0,
            views: p.view_count ?? 0,
            tags: [],
          }));
          setProfile({ ...data, posts });
        }
      } catch { /* ignore */ }
      setLoading(false);
    };
    loadProfile();
  }, [routeUsername, user]);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const displayPosts = profile?.posts ?? [];

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
            borderBottom: `1px solid rgba(var(--foreground-rgb),0.06)`,
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
                  background: `linear-gradient(135deg, var(--primary), #f472b6)`,
                  border: `3px solid rgba(var(--background-rgb), 0.9)`,
                  boxShadow: `0 8px 32px rgba(124,106,255,0.4)`,
                }}
              >
                <div className="w-full h-full flex items-center justify-center text-2xl font-black text-white">
                  NC
                </div>
                <div
                  className="absolute bottom-1 right-1 w-3 h-3 rounded-full"
                  style={{ background: `#34d399`, border: `2px solid rgba(var(--background-rgb), 0.9)` }}
                />
              </div>
              <div className="mb-2">
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-black text-foreground">{profile?.username ?? `加载中...`}</h1>
                  <span
                    className="px-2 py-0.5 rounded-full text-xs font-medium"
                    style={{ background: `rgba(124,106,255,0.15)`, color: `#a78bfa`, border: `1px solid rgba(124,106,255,0.25)` }}
                  >
                    ✦ Pro
                  </span>
                </div>
                <p className="text-sm" style={{ color: `rgba(var(--foreground-rgb), 0.55)` }}>@{profile?.username ?? "user"}</p>
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
                    background: following ? `rgba(var(--foreground-rgb),0.05)` : `linear-gradient(135deg, var(--primary), #38bdf8)`,
                    color: following ? `rgba(var(--foreground-rgb), 0.6)` : `white`,
                    border: following ? `1px solid rgba(var(--foreground-rgb),0.08)` : `none`,
                  }}
                >
                  {following ? `已关注` : `关注`}
                </button>
              </div>
            </div>
          </div>

          {/* Bio & info */}
          <div className="mb-8">
            <p className="text-sm leading-relaxed mb-4 max-w-2xl" style={{ color: `rgba(var(--foreground-rgb), 0.7)` }}>
              {profile?.bio || `这个人很懒，还没有写简介。`}
            </p>
            <div className="flex items-center gap-5 flex-wrap text-sm" style={{ color: `rgba(var(--foreground-rgb), 0.45)` }}>
              {profile?.location && <span className="flex items-center gap-1.5"><MapPin size={13} />{profile.location}</span>}
              {profile?.website && <span className="flex items-center gap-1.5"><Link2 size={13} />{profile.website}</span>}
              {profile?.created_at && <span className="flex items-center gap-1.5"><Calendar size={13} />{profile.created_at.slice(0, 7)}加入</span>}
              {profile?.twitter && <span className="flex items-center gap-1.5"><Twitter size={13} style={{ color: `#38bdf8` }} />@{profile.twitter.replace(/^@/, ``)}</span>}
            </div>
          </div>

          {/* Stats row */}
          <div className="flex gap-4 mb-8 flex-wrap">
            {[
              { label: `文章`, value: profile?.posts?.length ?? 0, icon: FileText, color: `var(--primary)` },
              { label: `总阅读量`, value: (profile?.posts ?? []).reduce((s, p) => s + (p.views ?? 0), 0), icon: Eye, color: `#38bdf8` },
              { label: `总获赞`, value: (profile?.posts ?? []).reduce((s, p) => s + (p.likes ?? 0), 0), icon: Heart, color: `#f59e0b` },
            ].map((stat) => (
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
                  <div className="text-xs" style={{ color: `rgba(var(--foreground-rgb), 0.45)` }}>{stat.label}</div>
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
                      color: activeTab === tab ? `#a78bfa` : `rgba(var(--foreground-rgb),0.55)`,
                      borderBottom: activeTab === tab ? `2px solid var(--primary)` : `2px solid transparent`,
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
              {/* Joined date */}
              <div className="glass-card p-5 mb-4">
                <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-foreground">
                  <Calendar size={15} style={{ color: `#38bdf8` }} />
                  加入时间
                </div>
                <p className="text-sm" style={{ color: `rgba(var(--foreground-rgb), 0.6)` }}>
                  {profile?.created_at?.slice(0, 10) ?? `未知`}
                </p>
              </div>

              {/* Trending posts */}
              <div className="glass-card p-5">
                <div className="flex items-center gap-2 mb-4 text-sm font-semibold text-foreground">
                  <Star size={15} style={{ color: `#f59e0b` }} />
                  最受欢迎
                </div>
                {(profile?.posts ?? []).slice(0, 5).map((post, i) => (
                  <div key={post.id} className="flex items-start gap-3 py-2.5 group cursor-pointer" onClick={() => navigate(`/post/${post.id}`)}>
                    <span className="text-xs font-black flex-shrink-0 mt-0.5" style={{ color: i < 2 ? `var(--primary)` : `rgba(var(--foreground-rgb),0.3)` }}>
                      {String(i + 1).padStart(2, `0`)}
                    </span>
                    <div>
                      <p className="text-xs leading-snug group-hover:text-purple-300 transition-colors" style={{ color: `rgba(var(--foreground-rgb),0.75)` }}>
                        {post.title}
                      </p>
                      <span className="flex items-center gap-2 mt-0.5 text-xs" style={{ color: `rgba(var(--foreground-rgb),0.35)` }}>
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
