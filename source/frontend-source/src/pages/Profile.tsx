import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  FileText, Eye, Calendar, MapPin, Link2,
  Twitter, Star, Heart, Edit2, UserPlus
} from "lucide-react";
import { toast } from "sonner";
import BlogCard, { BlogPost } from "../components/blog/BlogCard";
import GlassBackground from "../components/layout/GlassBackground";
import Navbar from "../components/layout/Navbar";
import { useAuth } from "../components/auth/AuthProvider";
import { profileApi, postsApi, type UserProfile, type ApiPost } from "../lib/api";

const tabOptions = [`我的文章`, `收藏`, `喜欢的`];

// @cuiruoni+P1修复：统一的文章卡片数据映射（含like_count/comment_count）
const toProfilePost = (p: ApiPost, username: string): BlogPost => ({
  id: p.id,
  title: p.title,
  excerpt: p.excerpt ?? p.summary ?? "",
  cover: p.cover ?? "",
  author: username,
  authorAvatar: username.slice(0, 2).toUpperCase(),
  date: p.created_at?.slice(0, 10) ?? "",
  readTime: 5,
  likes: p.likes ?? p.like_count ?? 0,
  comments: p.comments_count ?? p.comment_count ?? 0,
  views: p.views ?? p.view_count ?? 0,
  tags: p.tags ?? [],
});

// @cuiruoni+个人主页组件：从后端API获取用户资料和文章列表
const Profile = () => {
  const navigate = useNavigate();
  const { username: routeUsername } = useParams<{ username?: string }>();
  const { isLoggedIn, user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState("我的文章");
  const [following, setFollowing] = useState(false);
  const [profile, setProfile] = useState<(UserProfile & { posts: BlogPost[] }) | null>(null);
  const [tabPosts, setTabPosts] = useState<BlogPost[]>([]);
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
          const posts = (data.posts || []).map((p) => toProfilePost(p, data.username));
          setProfile({ ...data, posts });
        }
      } catch { /* ignore */ }
      setLoading(false);
    };
    loadProfile();
  }, [routeUsername, user]);

  // @cuiruoni+P1修复：关注状态以后端返回为准
  useEffect(() => {
    setFollowing(!!profile?.is_following);
  }, [profile?.is_following]);

  // @cuiruoni+P1修复：Tab数据（我的文章/收藏/喜欢的）接入真实API
  const loadTabPosts = useCallback(async () => {
    if (!profile) { setTabPosts([]); return; }
    if (activeTab === "我的文章") { setTabPosts(profile.posts); return; }
    if (!isOwn) { setTabPosts([]); return; }
    try {
      const data = activeTab === "收藏"
        ? await postsApi.bookmarked()
        : await postsApi.liked();
      setTabPosts(data.posts.map((p) => toProfilePost(p, profile.username)));
    } catch {
      setTabPosts([]);
    }
  }, [activeTab, profile, isOwn]);

  useEffect(() => {
    loadTabPosts();
  }, [loadTabPosts]);

  const handleToggleFollow = async () => {
    if (!isLoggedIn) { navigate("/login"); return; }
    const uname = profile?.username || routeUsername || user?.username || "";
    if (!uname) return;
    try {
      if (following) {
        await profileApi.unfollow(uname);
        setFollowing(false);
        setProfile((prev) => prev
          ? { ...prev, follower_count: Math.max(0, (prev.follower_count ?? 0) - 1) }
          : prev);
      } else {
        await profileApi.follow(uname);
        setFollowing(true);
        setProfile((prev) => prev
          ? { ...prev, follower_count: (prev.follower_count ?? 0) + 1 }
          : prev);
      }
    } catch {
      toast.error("操作失败，请稍后重试");
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const displayPosts = tabPosts;

  return (
    <div data-cmp="Profile" className="min-h-screen relative">
      <GlassBackground />
      <Navbar isLoggedIn={isLoggedIn} onLogout={handleLogout} onLogin={() => navigate(`/login`)} />

      <div className="relative z-10" style={{ paddingTop: 64 }}>
        {/* Profile banner */}
        <div className="h-52 relative overflow-hidden bg-[var(--muted)] border-b border-[var(--border)]">
        </div>

        <div className="mx-auto px-6" style={{ maxWidth: 1440 }}>
          {/* Avatar + actions row */}
          <div className="flex items-end justify-between mb-6 -mt-16 relative z-10">
            <div className="flex items-end gap-5">
              {/* Avatar */}
              <div
                className="relative rounded-2xl overflow-hidden flex-shrink-0 bg-[var(--foreground)] text-[var(--background)]"
                style={{
                  width: 96, height: 96,
                  border: `3px solid var(--background)`,
                }}
              >
                {profile?.avatar ? (
                  <img src={profile.avatar} alt="头像" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-2xl font-black">
                    {(profile?.username ?? user?.username ?? "U").slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div
                  className="absolute bottom-1 right-1 w-3 h-3 rounded-full bg-[var(--success)]"
                  style={{ border: `2px solid var(--background)` }}
                />
              </div>
              <div className="mb-2">
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-black text-[var(--foreground)]">{profile?.username ?? `加载中...`}</h1>
                </div>
                <p className="text-sm text-[var(--muted-foreground)]">@{profile?.username ?? "user"}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 mb-2">
              <div className={isOwn ? `` : `hidden`}>
                <button
                  onClick={() => navigate(`/settings`)}
                  className="btn-ghost flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm text-[var(--foreground)]"
                >
                  <Edit2 size={14} />
                  编辑资料
                </button>
              </div>
              <div className={isOwn ? `hidden` : ``}>
                <button
                  onClick={handleToggleFollow}
                  className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all border ${
                    following
                      ? "bg-[var(--muted)] text-[var(--muted-foreground)] border-[var(--border)]"
                      : "bg-[var(--foreground)] text-[var(--background)] border-[var(--foreground)]"
                  }`}
                >
                  {following ? `已关注` : `关注`}
                </button>
              </div>
            </div>
          </div>

          {/* Bio & info */}
          <div className="mb-8">
            <p className="text-sm leading-relaxed mb-4 max-w-2xl text-[var(--muted-foreground)]">
              {profile?.bio || `这个人很懒，还没有写简介。`}
            </p>
            <div className="flex items-center gap-5 flex-wrap text-sm text-[var(--muted-foreground)]">
              {profile?.location && <span className="flex items-center gap-1.5"><MapPin size={13} />{profile.location}</span>}
              {profile?.website && <span className="flex items-center gap-1.5"><Link2 size={13} />{profile.website}</span>}
              {profile?.created_at && <span className="flex items-center gap-1.5"><Calendar size={13} />{profile.created_at.slice(0, 7)}加入</span>}
              {profile?.twitter && <span className="flex items-center gap-1.5"><Twitter size={13} />@{profile.twitter.replace(/^@/, ``)}</span>}
            </div>
          </div>

          {/* Stats row */}
          <div className="flex gap-4 mb-8 flex-wrap">
            {[
              { label: `文章`, value: profile?.posts?.length ?? 0, icon: FileText },
              { label: `总阅读量`, value: (profile?.posts ?? []).reduce((s, p) => s + (p.views ?? 0), 0), icon: Eye },
              { label: `总获赞`, value: (profile?.posts ?? []).reduce((s, p) => s + (p.likes ?? 0), 0), icon: Heart },
              { label: `关注者`, value: profile?.follower_count ?? 0, icon: UserPlus },
              { label: `关注中`, value: profile?.following_count ?? 0, icon: UserPlus },
            ].map((stat) => (
              <div
                key={stat.label}
                className="card flex items-center gap-3 px-5 py-4"
                style={{ flex: `1 1 180px`, minWidth: 150 }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center bg-[var(--muted)] text-[var(--muted-foreground)]"
                >
                  <stat.icon size={18} />
                </div>
                <div>
                  <div className="text-xl font-black text-[var(--foreground)]">{stat.value}</div>
                  <div className="text-xs text-[var(--muted-foreground)]">{stat.label}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-8">
            {/* Main posts area */}
            <div className="flex-1 min-w-0">
              {/* Tab nav */}
              <div className="flex items-center gap-1 mb-6">
                {(isOwn ? tabOptions : tabOptions.filter((t) => t === "我的文章")).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-5 py-2.5 text-sm font-medium transition-all border-b-2 ${
                      activeTab === tab
                        ? "bg-[var(--brand-subtle)] text-[var(--foreground)] border-[var(--foreground)]"
                        : "text-[var(--muted-foreground)] border-transparent"
                    }`}
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
              <div className="card p-5 mb-4">
                <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-[var(--foreground)]">
                  <Calendar size={15} />
                  加入时间
                </div>
                <p className="text-sm text-[var(--muted-foreground)]">
                  {profile?.created_at?.slice(0, 10) ?? `未知`}
                </p>
              </div>

              {/* Trending posts */}
              <div className="card p-5">
                <div className="flex items-center gap-2 mb-4 text-sm font-semibold text-[var(--foreground)]">
                  <Star size={15} />
                  最受欢迎
                </div>
                {(profile?.posts ?? []).slice(0, 5).map((post, i) => (
                  <div key={post.id} className="flex items-start gap-3 py-2.5 group cursor-pointer" onClick={() => navigate(`/post/${post.id}`)}>
                    <span className={`text-xs font-black flex-shrink-0 mt-0.5 ${i < 2 ? "text-[var(--foreground)]" : "text-[var(--muted-foreground)]"}`}>
                      {String(i + 1).padStart(2, `0`)}
                    </span>
                    <div>
                      <p className="text-xs leading-snug text-[var(--muted-foreground)] group-hover:text-[var(--foreground)] transition-colors">
                        {post.title}
                      </p>
                      <span className="flex items-center gap-2 mt-0.5 text-xs text-[var(--muted-foreground)]">
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
