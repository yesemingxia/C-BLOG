import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Heart, MessageCircle, UserPlus, Star, Check, CheckCheck, Trash2, Filter } from "lucide-react";
import GlassBackground from "../components/layout/GlassBackground";
import Navbar from "../components/layout/Navbar";
import { useAuth } from "../components/auth/AuthProvider";
import { notificationsApi, ApiNotification } from "../lib/api";

// @cuiruoni+通知类型定义：5种通知——like(点赞)、comment(评论)、follow(关注)、system(系统)、mention(提及)
type NotifType = `like` | `comment` | `follow` | `system` | `mention`;

interface Notification {
  id: number;
  type: NotifType;
  user: string;
  userAvatar: string;
  content: string;
  time: string;
  read: boolean;
  postTitle?: string;
}

const notifs: Notification[] = [];

// @cuiruoni+通知类型配置：每种类型对应独立的图标，统一使用monochrome样式
const typeConfig: Record<NotifType, { icon: typeof Bell }> = {
  like: { icon: Heart },
  comment: { icon: MessageCircle },
  follow: { icon: UserPlus },
  system: { icon: Star },
  mention: { icon: Bell },
};

const filterOptions = [`全部`, `点赞`, `评论`, `关注`, `系统`];

// @cuiruoni+通知中心组件：5种通知类型展示、已读/未读状态、筛选过滤、批量标记已读和删除
const Notifications = () => {
  const navigate = useNavigate();
  const { isLoggedIn, logout } = useAuth();
  const [items, setItems] = useState(notifs);
  const [filter, setFilter] = useState("全部");

  // @cuiruoni+从API加载通知列表，将ApiNotification映射为本地Notification接口
  useEffect(() => {
    notificationsApi.list().then((data) => {
      const mapped: Notification[] = data.map((n) => ({
        id: n.id,
        type: n.type as NotifType,
        user: n.actor_name || `系统`,
        userAvatar: n.actor_name ? n.actor_name.split(` `).map((s) => s[0]).join(``).slice(0, 2) : `⚡`,
        content: n.content,
        time: n.created_at,
        read: !!n.is_read,
        postTitle: n.post_title || undefined,
      }));
      setItems(mapped);
    });
  }, []);

  // @cuiruoni+筛选逻辑：按通知类型过滤，"评论"包含comment和mention两种类型
  const filtered = items.filter((n) => {
    if (filter === `全部`) return true;
    if (filter === `点赞`) return n.type === `like`;
    if (filter === `评论`) return n.type === `comment` || n.type === `mention`;
    if (filter === `关注`) return n.type === `follow`;
    if (filter === `系统`) return n.type === `system`;
    return true;
  });

  const unreadCount = items.filter((n) => !n.read).length;

  const markAllRead = () => {
    notificationsApi.markAllRead();
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const markRead = (id: number) => {
    notificationsApi.markRead(id);
    setItems((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
  };

  const deleteItem = (id: number) => {
    if (!window.confirm("确定要删除这条通知吗？")) return;
    notificationsApi.delete(id);
    setItems((prev) => prev.filter((n) => n.id !== id));
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div data-cmp="Notifications" className="min-h-screen relative">
      <GlassBackground />
      <Navbar isLoggedIn={isLoggedIn} onLogout={handleLogout} onLogin={() => navigate(`/login`)} />

      <div className="relative z-10" style={{ paddingTop: 64 }}>
        <div className="mx-auto px-6 py-10" style={{ maxWidth: 800 }}>
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-black text-[var(--foreground)] flex items-center gap-3">
                <Bell size={22} />
                通知中心
                <div className={unreadCount > 0 ? `` : `hidden`}>
                  <span
                    className="text-sm px-2.5 py-0.5 rounded-full font-semibold bg-[var(--brand-subtle)] text-[var(--foreground)]"
                  >
                    {unreadCount}
                  </span>
                </div>
              </h1>
              <p className="text-sm mt-1 text-[var(--muted-foreground)]">
                {unreadCount > 0 ? `你有 ${unreadCount} 条未读通知` : `所有通知都已读完啦`}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={markAllRead}
                className="btn-ghost flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-[var(--foreground)]"
              >
                <CheckCheck size={14} />
                全部已读
              </button>
            </div>
          </div>

          {/* Filter tabs */}
          <div className="flex items-center gap-2 mb-6 flex-wrap">
            <Filter size={14} className="text-[var(--muted-foreground)]" />
            {filterOptions.map((opt) => (
              <button
                key={opt}
                onClick={() => setFilter(opt)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all border ${
                  filter === opt
                    ? "bg-[var(--brand-subtle)] text-[var(--foreground)] border-[var(--border-strong)]"
                    : "bg-[var(--muted)] text-[var(--muted-foreground)] border-[var(--border)]"
                }`}
              >
                {opt}
              </button>
            ))}
          </div>

          {/* Notifications list */}
          <div className="flex flex-col gap-3">
            {filtered.map((notif, i) => {
              const cfg = typeConfig[notif.type];
              const IconComp = cfg.icon;
              return (
                <div
                  key={notif.id}
                  onClick={() => markRead(notif.id)}
                  className={`relative rounded-2xl overflow-hidden cursor-pointer transition-all group border ${
                    notif.read
                      ? "bg-[var(--card)] border-[var(--border)]"
                      : "bg-[var(--brand-subtle)] border-[var(--border-strong)]"
                  }`}
                  style={{
                    animationDelay: `${i * 0.05}s`,
                    animation: `slide-in-up 0.4s ease forwards`,
                    opacity: 0,
                  }}
                >
                  {/* Unread indicator */}
                  <div
                    className="absolute left-0 top-0 bottom-0 w-0.5 bg-[var(--foreground)]"
                    style={{
                      opacity: notif.read ? 0 : 1,
                    }}
                  />

                  <div className="flex items-start gap-4 p-4 pl-5">
                    {/* Icon */}
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 bg-[var(--muted)] text-[var(--muted-foreground)]"
                    >
                      <IconComp size={18} />
                    </div>

                    {/* User avatar + content */}
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-xs font-bold bg-[var(--foreground)] text-[var(--background)]"
                      >
                        {notif.type === `system` ? `⚡` : notif.userAvatar}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-[var(--foreground)]">
                          <span className="font-semibold">{notif.user}</span>
                          <span className="ml-1 text-[var(--muted-foreground)]">{notif.content}</span>
                        </div>
                        <div className={notif.postTitle ? `mt-1` : `hidden`}>
                          <span
                            className="text-xs px-2 py-1 rounded-lg bg-[var(--brand-subtle)] text-[var(--foreground)]"
                          >
                            《{notif.postTitle}》
                          </span>
                        </div>
                        <div className="text-xs mt-1.5 text-[var(--muted-foreground)]">
                          {notif.time}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className={notif.read ? `hidden` : ``}>
                        <button
                          onClick={(e) => { e.stopPropagation(); markRead(notif.id); }}
                          className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--brand-subtle)]"
                          title="标为已读"
                        >
                          <Check size={13} className="text-[var(--success)]" />
                        </button>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteItem(notif.id); }}
                        className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--brand-subtle)]"
                        title="删除"
                      >
                        <Trash2 size={13} className="text-[var(--muted-foreground)]" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Empty state */}
          <div className={filtered.length === 0 ? `text-center py-20` : `hidden`}>
            <div className="text-5xl mb-4">🔔</div>
            <div className="text-[var(--foreground)] font-medium mb-2">暂无通知</div>
            <div className="text-sm text-[var(--muted-foreground)]">
              继续创作，等待读者的互动吧！
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Notifications;
