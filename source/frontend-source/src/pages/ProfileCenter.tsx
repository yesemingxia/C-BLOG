/* ProfileCenter.tsx — 个人管理中心（/profile）
 *
 * 普通登录用户的自助管理页，与 /admin 同一套舞台视觉
 * （ShowcaseBackdrop + .stage-page.dark 半透明卡片），功能对齐被移除的
 * 旧 Settings / Profile / Notifications 三个页面：
 *
 *   · 资料设置   → profileApi.update（头像走 /api/upload/image 上传后回填 URL）
 *   · 修改密码   → profileApi.changePassword
 *   · 我的文章   → profileApi.getPublicProfile(username).posts
 *                  （编辑 → /showcase?edit=<id> 场景 3 编辑器；删除 → postsApi.delete）
 *   · 点赞与收藏 → postsApi.liked / postsApi.bookmarked
 *   · 通知中心   → notificationsApi.list / markRead / markAllRead / delete
 *
 * 侧栏布局照抄 Admin.tsx（fixed 侧栏 + 小屏顶部横排 tab），品牌位用站点图标。
 */

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  User, Lock, FileText, Heart, Bell, Bookmark,
  Trash2, LogOut, ChevronLeft, ChevronRight, Loader2, Upload, Eye, Check, Video,
} from "lucide-react";
import { toast } from "sonner";
import "../styles/showcase-stage-pages.css";
import ShowcaseBackdrop from "../showcase/components/ShowcaseBackdrop";
import { useAuth } from "../components/auth/AuthProvider";
import {
  profileApi, postsApi, notificationsApi, uploadApi, videosApi,
  type UserProfile, type ApiPost, type ApiNotification, type VideoSubmission,
} from "../lib/api";

const TABS = [
  { key: "profile", label: "资料设置", icon: User },
  { key: "password", label: "修改密码", icon: Lock },
  { key: "posts", label: "我的文章", icon: FileText },
  { key: "likes", label: "点赞与收藏", icon: Heart },
  { key: "videos", label: "投稿视频", icon: Video },
  { key: "notifications", label: "通知中心", icon: Bell },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/* ---------------- 通用小组件 ---------------- */

const Field = ({
  label, children,
}: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1.5">
    <label className="text-xs font-medium text-[var(--muted-foreground)]">{label}</label>
    {children}
  </div>
);

const inputCls =
  "w-full rounded-xl border border-[var(--border)] bg-[var(--muted)] px-3.5 py-2.5 text-sm text-[var(--foreground)] outline-none transition-colors focus:border-[var(--ring)]";

const PostRow = ({
  post, actions,
}: { post: ApiPost; actions?: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--muted)]/40 px-4 py-3">
    <div className="min-w-0">
      <p className="truncate text-sm font-medium text-[var(--foreground)]">{post.title}</p>
      <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
        {(post.created_at ?? "").slice(0, 10) || "—"}
        {typeof post.views === "number" && <> · {post.views} 次浏览</>}
        {post.status === "draft" && " · 草稿"}
      </p>
    </div>
    <div className="flex flex-shrink-0 items-center gap-2">{actions}</div>
  </div>
);

const iconBtn =
  "flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)] hover:bg-[var(--brand-subtle)]";

/* ---------------- 页面 ---------------- */

const ProfileCenter = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<TabKey>("profile");
  const [collapsed, setCollapsed] = useState(false);

  /* ---- 资料 ---- */
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [website, setWebsite] = useState("");
  const [twitter, setTwitter] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  /* ---- 密码 ---- */
  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [newPwd2, setNewPwd2] = useState("");
  const [savingPwd, setSavingPwd] = useState(false);

  /* ---- 我的文章 / 点赞收藏 / 通知 ---- */
  const [myPosts, setMyPosts] = useState<ApiPost[]>([]);
  const [liked, setLiked] = useState<ApiPost[]>([]);
  const [bookmarked, setBookmarked] = useState<ApiPost[]>([]);
  const [notifications, setNotifications] = useState<ApiNotification[]>([]);
  const [loadingLists, setLoadingLists] = useState(false);

  /* ---- 投稿视频（断点续传）---- */
  const [myVideos, setMyVideos] = useState<VideoSubmission[]>([]);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const videoInputRef = useRef<HTMLInputElement | null>(null);

  const loadProfile = useCallback(async () => {
    const p = await profileApi.get();
    setProfile(p);
    if (p) {
      setBio(p.bio ?? "");
      setLocation(p.location ?? "");
      setWebsite(p.website ?? "");
      setTwitter(p.twitter ?? "");
      setAvatarUrl(p.avatar ?? "");
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const loadPosts = useCallback(async () => {
    setLoadingLists(true);
    try {
      // @cuiruoni+/posts/mine = 本人全部文章（含草稿），带浏览量/点赞/评论数
      const res = await postsApi.mine(1, 50);
      setMyPosts(res.posts);
    } catch {
      toast.error("加载文章列表失败");
    } finally {
      setLoadingLists(false);
    }
  }, []);

  const loadLikes = useCallback(async () => {
    setLoadingLists(true);
    try {
      const [l, b] = await Promise.all([postsApi.liked(1, 50), postsApi.bookmarked(1, 50)]);
      setLiked(l.posts);
      setBookmarked(b.posts);
    } catch {
      toast.error("加载点赞/收藏失败");
    } finally {
      setLoadingLists(false);
    }
  }, []);

  const loadNotifications = useCallback(async () => {
    setLoadingLists(true);
    try {
      setNotifications(await notificationsApi.list());
    } catch {
      toast.error("加载通知失败");
    } finally {
      setLoadingLists(false);
    }
  }, []);

  const loadVideos = useCallback(async () => {
    setLoadingLists(true);
    try {
      setMyVideos(await videosApi.mine());
    } catch {
      toast.error("加载投稿列表失败");
    } finally {
      setLoadingLists(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "posts") loadPosts();
    else if (tab === "likes") loadLikes();
    else if (tab === "notifications") loadNotifications();
    else if (tab === "videos") loadVideos();
  }, [tab, loadPosts, loadLikes, loadNotifications, loadVideos]);

  /** 上传投稿：分片断点续传（init → 1MB 分片 → complete），进度实时回显 */
  const handleVideoChosen = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingVideo(true);
    setVideoProgress(0);
    try {
      await videosApi.upload(file, (percent) => setVideoProgress(percent));
      toast.success("投稿成功，等待管理员审核");
      await loadVideos();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploadingVideo(false);
    }
  };

  const handleDeleteVideo = async (id: number) => {
    if (!window.confirm("确定要删除这条投稿吗？")) return;
    try {
      await videosApi.remove(id);
      setMyVideos((prev) => prev.filter((v) => v.id !== id));
      toast.success("投稿已删除");
    } catch {
      toast.error("删除失败");
    }
  };

  /* ---- 头像上传：复用 /api/upload/image，成功后回填并保存 ---- */
  /** @cuiruoni+后端 update_profile 是整行覆盖：缺失字段会写成空串。
      所以无论改哪一项，都必须把 email/头像/资料**全量**提交。 */
  const buildProfilePayload = (avatar: string) => ({
    email: profile?.email ?? "",
    bio,
    avatar,
    location,
    website,
    twitter,
  });

  const handleAvatarChosen = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const url = await uploadApi.image(file);
      setAvatarUrl(url);
      await profileApi.update(buildProfilePayload(url));
      toast.success("头像已更新");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "头像上传失败");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      const p = await profileApi.update(buildProfilePayload(avatarUrl));
      setProfile(p);
      toast.success("资料已保存");
    } catch {
      toast.error("保存失败");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePwd = async () => {
    if (newPwd.length < 6) {
      toast.error("新密码至少 6 位");
      return;
    }
    if (newPwd !== newPwd2) {
      toast.error("两次输入的新密码不一致");
      return;
    }
    setSavingPwd(true);
    try {
      await profileApi.changePassword(oldPwd, newPwd);
      setOldPwd("");
      setNewPwd("");
      setNewPwd2("");
      toast.success("密码已修改");
    } catch {
      toast.error("修改失败，请检查旧密码");
    } finally {
      setSavingPwd(false);
    }
  };

  const handleDeletePost = async (id: number) => {
    if (!window.confirm("确定要删除这篇文章吗？此操作不可恢复。")) return;
    try {
      await postsApi.delete(id);
      setMyPosts((prev) => prev.filter((p) => p.id !== id));
      toast.success("文章已删除");
    } catch {
      toast.error("删除失败");
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationsApi.markAllRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch {
      toast.error("操作失败");
    }
  };

  const handleMarkRead = async (id: number) => {
    try {
      await notificationsApi.markRead(id);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    } catch {
      toast.error("操作失败");
    }
  };

  const handleDeleteNotification = async (id: number) => {
    try {
      await notificationsApi.delete(id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    } catch {
      toast.error("删除失败");
    }
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const avatarBlock = (
    <div className="flex items-center gap-4">
      <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--muted)]">
        {avatarUrl ? (
          <img src={avatarUrl} alt="头像" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xl font-bold text-[var(--muted-foreground)]">
            {(user?.username ?? "U").charAt(0).toUpperCase()}
          </div>
        )}
      </div>
      <div className="space-y-2">
        <button
          type="button"
          disabled={uploadingAvatar}
          onClick={() => avatarInputRef.current?.click()}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)] disabled:opacity-50"
        >
          {uploadingAvatar ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
          {uploadingAvatar ? "上传中…" : "上传新头像"}
        </button>
        <p className="text-xs text-[var(--muted-foreground)]">
          {profile?.follower_count ?? 0} 粉丝 · {profile?.following_count ?? 0} 关注中
        </p>
      </div>
    </div>
  );

  return (
    <div data-cmp="ProfileCenter" className="stage-page dark min-h-screen relative font-display">
      <ShowcaseBackdrop dim={0.55} source="scene2" />

      {/* 投稿视频的文件选择框 */}
      <input
        ref={videoInputRef}
        type="file"
        accept="video/mp4,video/webm"
        className="hidden"
        onChange={handleVideoChosen}
        aria-hidden="true"
      />

      <input
        ref={avatarInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
        className="hidden"
        onChange={handleAvatarChosen}
        aria-hidden="true"
      />

      {/* 桌面端侧栏 */}
      <div
        className="fixed left-0 top-0 bottom-0 z-30 hidden border-r border-[var(--border)] bg-[var(--card)] transition-all duration-300 lg:block"
        style={{ width: collapsed ? 72 : 220 }}
      >
        <div className="flex h-full flex-col">
          <div
            className="flex cursor-pointer items-center gap-2.5 px-4 py-5 transition-opacity hover:opacity-80"
            onClick={() => navigate("/")}
          >
            <div className="h-9 w-9 flex-shrink-0 overflow-hidden rounded-xl border border-[var(--border)]">
              <img src="/favicon.png" alt="Home" className="h-full w-full object-cover" />
            </div>
            {!collapsed && (
              <span className="text-base font-bold tracking-tight text-[var(--foreground)]">
                个人中心
              </span>
            )}
          </div>

          <div className="mt-2 flex-1 space-y-1 px-3">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                  tab === t.key
                    ? "bg-[var(--brand-subtle)] text-[var(--foreground)]"
                    : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                }`}
              >
                <t.icon size={17} strokeWidth={tab === t.key ? 2.5 : 2} />
                {!collapsed && <span>{t.label}</span>}
                {t.key === "notifications" && unreadCount > 0 && (
                  <span className="ml-auto rounded-full bg-[var(--primary)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--primary-foreground)]">
                    {unreadCount}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="space-y-2 border-t border-[var(--border)] px-3 pb-4 pt-3">
            <button
              onClick={() => setCollapsed((p) => !p)}
              className="hidden w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-[var(--muted-foreground)] transition-all hover:text-[var(--foreground)] lg:flex"
            >
              {collapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
              {!collapsed && <span>收起侧栏</span>}
            </button>
            <button
              onClick={async () => {
                await logout();
                navigate("/login");
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-[var(--destructive)] transition-all hover:bg-[var(--destructive-subtle)]"
            >
              <LogOut size={17} />
              {!collapsed && <span>退出登录</span>}
            </button>
          </div>
        </div>
      </div>

      {/* 主内容区 */}
      <div
        className="relative z-10 transition-all duration-300"
        style={{ marginLeft: collapsed ? 72 : 220 }}
      >
        <div className="mx-auto max-w-3xl p-4 sm:p-6 lg:p-8">
          <div className="mb-6">
            <h1 className="text-xl font-bold text-[var(--foreground)] sm:text-2xl">
              {TABS.find((t) => t.key === tab)?.label}
            </h1>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              {user?.username} · {profile?.role === "admin" ? "管理员" : "普通用户"}
            </p>
          </div>

          {/* ---------- 资料设置 ---------- */}
          {tab === "profile" && profile && (
            <div className="space-y-5 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 sm:p-6">
              {avatarBlock}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="用户名">
                  <input className={inputCls} value={profile.username} disabled />
                </Field>
                <Field label="邮箱">
                  <input className={inputCls} value={profile.email} disabled />
                </Field>
              </div>
              <Field label="个人简介">
                <textarea className={inputCls} rows={3} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="介绍一下自己…" />
              </Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field label="所在地">
                  <input className={inputCls} value={location} onChange={(e) => setLocation(e.target.value)} />
                </Field>
                <Field label="个人网站">
                  <input className={inputCls} value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" />
                </Field>
                <Field label="Twitter / 抖音">
                  <input className={inputCls} value={twitter} onChange={(e) => setTwitter(e.target.value)} />
                </Field>
              </div>
              <button
                onClick={handleSaveProfile}
                disabled={savingProfile}
                className="rounded-xl bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-[var(--primary-foreground)] transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {savingProfile ? "保存中…" : "保存资料"}
              </button>
            </div>
          )}

          {/* ---------- 修改密码 ---------- */}
          {tab === "password" && (
            <div className="max-w-md space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 sm:p-6">
              <Field label="旧密码">
                <input type="password" className={inputCls} value={oldPwd} onChange={(e) => setOldPwd(e.target.value)} placeholder="••••••••" />
              </Field>
              <Field label="新密码（至少 6 位）">
                <input type="password" className={inputCls} value={newPwd} onChange={(e) => setNewPwd(e.target.value)} placeholder="••••••••" />
              </Field>
              <Field label="确认新密码">
                <input type="password" className={inputCls} value={newPwd2} onChange={(e) => setNewPwd2(e.target.value)} placeholder="••••••••" />
              </Field>
              <button
                onClick={handleChangePwd}
                disabled={savingPwd || !oldPwd || !newPwd}
                className="rounded-xl bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-[var(--primary-foreground)] transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {savingPwd ? "提交中…" : "修改密码"}
              </button>
            </div>
          )}

          {/* ---------- 我的文章 ---------- */}
          {tab === "posts" && (
            <div className="space-y-3">
              {loadingLists && <p className="text-sm text-[var(--muted-foreground)]">加载中…</p>}
              {!loadingLists && myPosts.length === 0 && (
                <p className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8 text-center text-sm text-[var(--muted-foreground)]">
                  还没有发布过文章，去场景 3 写一篇吧
                </p>
              )}
              {myPosts.map((p) => (
                <PostRow
                  key={p.id}
                  post={p}
                  actions={
                    <>
                      <button
                        className={iconBtn}
                        onClick={() => navigate(`/showcase?edit=${p.id}`)}
                      >
                        <Eye size={13} /> 编辑
                      </button>
                      <button
                        className="flex items-center gap-1.5 rounded-lg border border-[var(--destructive)]/20 bg-[var(--destructive-subtle)] px-2.5 py-1.5 text-xs text-[var(--destructive)] transition-colors hover:opacity-80"
                        onClick={() => handleDeletePost(p.id)}
                      >
                        <Trash2 size={13} /> 删除
                      </button>
                    </>
                  }
                />
              ))}
            </div>
          )}

          {/* ---------- 点赞与收藏 ---------- */}
          {tab === "likes" && (
            <div className="space-y-6">
              {loadingLists && <p className="text-sm text-[var(--muted-foreground)]">加载中…</p>}
              <section className="space-y-3">
                <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--foreground)]">
                  <Heart size={15} className="text-[var(--primary)]" /> 我点赞的文章
                </h3>
                {liked.length === 0 && !loadingLists && (
                  <p className="text-sm text-[var(--muted-foreground)]">暂无</p>
                )}
                {liked.map((p) => (
                  <PostRow key={`l-${p.id}`} post={p} />
                ))}
              </section>
              <section className="space-y-3">
                <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--foreground)]">
                  <Bookmark size={15} className="text-[var(--primary)]" /> 我收藏的文章
                </h3>
                {bookmarked.length === 0 && !loadingLists && (
                  <p className="text-sm text-[var(--muted-foreground)]">暂无</p>
                )}
                {bookmarked.map((p) => (
                  <PostRow key={`b-${p.id}`} post={p} />
                ))}
              </section>
            </div>
          )}

          {/* ---------- 投稿视频 ---------- */}
          {tab === "videos" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
                <div>
                  <h3 className="text-sm font-bold text-[var(--foreground)]">投稿背景视频</h3>
                  <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                    MP4 / WebM · ≤50MB。管理员审核通过后可将其设为主页背景（同一时间只显示一支）。
                  </p>
                </div>
                <button
                  type="button"
                  disabled={uploadingVideo}
                  onClick={() => videoInputRef.current?.click()}
                  className="flex flex-shrink-0 items-center gap-1.5 rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-[var(--primary-foreground)] transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {uploadingVideo ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                  {uploadingVideo ? `上传中 ${videoProgress}%` : "上传投稿"}
                </button>
              </div>

              {loadingLists && <p className="text-sm text-[var(--muted-foreground)]">加载中…</p>}
              {!loadingLists && myVideos.length === 0 && (
                <p className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8 text-center text-sm text-[var(--muted-foreground)]">
                  还没有投稿
                </p>
              )}
              {myVideos.map((v) => (
                <div
                  key={v.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--muted)]/40 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[var(--foreground)]">
                      {v.original_name || v.filename}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                      {(v.created_at ?? "").slice(0, 16).replace("T", " ")}
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-2">
                    <span
                      className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${
                        v.is_active
                          ? "border-[var(--brand-border)] bg-[var(--brand-subtle)] text-[var(--primary)]"
                          : v.status === "approved"
                            ? "border-[var(--success)]/20 bg-[var(--success-subtle)] text-[var(--success)]"
                            : v.status === "rejected"
                              ? "border-[var(--destructive)]/20 bg-[var(--destructive-subtle)] text-[var(--destructive)]"
                              : "border-[var(--border)] bg-[var(--brand-subtle)] text-[var(--muted-foreground)]"
                      }`}
                    >
                      {v.is_active ? "当前主页背景" : v.status === "approved" ? "审核通过" : v.status === "rejected" ? "未通过" : "待审核"}
                    </span>
                    <button
                      className="flex items-center gap-1.5 rounded-lg border border-[var(--destructive)]/20 bg-[var(--destructive-subtle)] px-2.5 py-1.5 text-xs text-[var(--destructive)] transition-colors hover:opacity-80"
                      onClick={() => handleDeleteVideo(v.id)}
                    >
                      <Trash2 size={13} /> 删除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ---------- 通知中心 ---------- */}
          {tab === "notifications" && (
            <div className="space-y-3">
              <div className="flex justify-end">
                <button onClick={handleMarkAllRead} className={iconBtn}>
                  <Check size={13} /> 全部已读
                </button>
              </div>
              {notifications.length === 0 && (
                <p className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8 text-center text-sm text-[var(--muted-foreground)]">
                  暂无通知
                </p>
              )}
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={`rounded-xl border px-4 py-3 ${
                    n.is_read
                      ? "border-[var(--border)] bg-[var(--muted)]/30"
                      : "border-[var(--brand-border)] bg-[var(--brand-subtle)]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-[var(--foreground)]">
                        <span className="font-semibold">{n.actor_name}</span>{" "}
                        {n.content}
                        {n.post_title && <span className="text-[var(--muted-foreground)]">《{n.post_title}》</span>}
                      </p>
                      <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                        {(n.created_at ?? "").slice(0, 16).replace("T", " ")}
                      </p>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-2">
                      {!n.is_read && (
                        <button className={iconBtn} onClick={() => handleMarkRead(n.id)}>
                          <Check size={12} /> 已读
                        </button>
                      )}
                      <button
                        className="rounded-lg border border-[var(--destructive)]/20 bg-[var(--destructive-subtle)] p-1.5 text-[var(--destructive)] transition-colors hover:opacity-80"
                        onClick={() => handleDeleteNotification(n.id)}
                        aria-label="删除通知"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProfileCenter;
