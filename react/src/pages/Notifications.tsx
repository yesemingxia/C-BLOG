import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Heart, MessageCircle, UserPlus, Star, Check, CheckCheck, Trash2, Filter } from "lucide-react";
import GlassBackground from "../components/GlassBackground";
import Navbar from "../components/Navbar";

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

const notifs: Notification[] = [
  { id: 1, type: `like`, user: `Luna Park`, userAvatar: `LP`, content: `点赞了你的文章`, postTitle: `探索现代前端架构的无限可能`, time: `2分钟前`, read: false },
  { id: 2, type: `comment`, user: `Kai Zhao`, userAvatar: `KZ`, content: `评论了你的文章：「TypeScript 那一块讲得很清晰，赞！」`, postTitle: `CSS 液态玻璃效果完全指南`, time: `15分钟前`, read: false },
  { id: 3, type: `follow`, user: `Mia Liu`, userAvatar: `ML`, content: `关注了你`, time: `1小时前`, read: false },
  { id: 4, type: `like`, user: `Alex Wu`, userAvatar: `AW`, content: `点赞了你的文章`, postTitle: `TypeScript 5.0 类型体操`, time: `2小时前`, read: true },
  { id: 5, type: `mention`, user: `Sam Jin`, userAvatar: `SJ`, content: `在评论中提到了你`, postTitle: `构建全栈应用的最佳实践`, time: `3小时前`, read: true },
  { id: 6, type: `system`, user: `Luminary`, userAvatar: `⚡`, content: `你的文章《探索现代前端架构》已被设为精选推荐`, time: `1天前`, read: true },
  { id: 7, type: `comment`, user: `Zoe Wang`, userAvatar: `ZW`, content: `评论了你的文章：「已收藏！写得真棒！」`, postTitle: `设计系统从零搭建实践指南`, time: `1天前`, read: true },
  { id: 8, type: `follow`, user: `Ben Li`, userAvatar: `BL`, content: `关注了你`, time: `2天前`, read: true },
  { id: 9, type: `like`, user: `Ella Song`, userAvatar: `ES`, content: `点赞了你的文章`, postTitle: `AI 辅助编程的未来展望`, time: `3天前`, read: true },
];

const typeConfig: Record<NotifType, { icon: typeof Bell; color: string; bg: string }> = {
  like: { icon: Heart, color: `#f472b6`, bg: `rgba(244,114,182,0.12)` },
  comment: { icon: MessageCircle, color: `#38bdf8`, bg: `rgba(56,189,248,0.12)` },
  follow: { icon: UserPlus, color: `#34d399`, bg: `rgba(52,211,153,0.12)` },
  system: { icon: Star, color: `#f59e0b`, bg: `rgba(245,158,11,0.12)` },
  mention: { icon: Bell, color: `#a78bfa`, bg: `rgba(167,139,250,0.12)` },
};

const filterOptions = [`全部`, `点赞`, `评论`, `关注`, `系统`];

const Notifications = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState(notifs);
  const [filter, setFilter] = useState(`全部`);
  const [isLoggedIn] = useState(() => !!localStorage.getItem(`blog_logged_in`));

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
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const markRead = (id: number) => {
    setItems((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
  };

  const deleteItem = (id: number) => {
    setItems((prev) => prev.filter((n) => n.id !== id));
  };

  const handleLogout = () => {
    localStorage.removeItem(`blog_logged_in`);
    navigate(`/login`);
  };

  return (
    <div data-cmp="Notifications" className="min-h-screen relative">
      <GlassBackground showParticles={false} />
      <Navbar isLoggedIn={isLoggedIn} onLogout={handleLogout} onLogin={() => navigate(`/login`)} />

      <div className="relative z-10" style={{ paddingTop: 64 }}>
        <div className="mx-auto px-6 py-10" style={{ maxWidth: 800 }}>
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-black text-foreground flex items-center gap-3">
                <Bell size={22} style={{ color: `#7c6aff` }} />
                通知中心
                <div className={unreadCount > 0 ? `` : `hidden`}>
                  <span
                    className="text-sm px-2.5 py-0.5 rounded-full font-semibold"
                    style={{ background: `rgba(244,114,182,0.2)`, color: `#f472b6` }}
                  >
                    {unreadCount}
                  </span>
                </div>
              </h1>
              <p className="text-sm mt-1" style={{ color: `rgba(232,234,246,0.45)` }}>
                {unreadCount > 0 ? `你有 ${unreadCount} 条未读通知` : `所有通知都已读完啦 ✓`}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={markAllRead}
                className="btn-ghost-glass flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-foreground"
              >
                <CheckCheck size={14} />
                全部已读
              </button>
            </div>
          </div>

          {/* Filter tabs */}
          <div className="flex items-center gap-2 mb-6 flex-wrap">
            <Filter size={14} style={{ color: `rgba(232,234,246,0.4)` }} />
            {filterOptions.map((opt) => (
              <button
                key={opt}
                onClick={() => setFilter(opt)}
                className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
                style={{
                  background: filter === opt ? `rgba(124,106,255,0.15)` : `rgba(255,255,255,0.04)`,
                  color: filter === opt ? `#a78bfa` : `rgba(232,234,246,0.6)`,
                  border: `1px solid ${filter === opt ? `rgba(124,106,255,0.3)` : `rgba(255,255,255,0.06)`}`,
                }}
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
                  className="relative rounded-2xl overflow-hidden cursor-pointer transition-all group"
                  style={{
                    background: notif.read ? `rgba(255,255,255,0.03)` : `rgba(124,106,255,0.06)`,
                    border: `1px solid ${notif.read ? `rgba(255,255,255,0.06)` : `rgba(124,106,255,0.15)`}`,
                    backdropFilter: `blur(12px)`,
                    animationDelay: `${i * 0.05}s`,
                    animation: `slide-in-up 0.4s ease forwards`,
                    opacity: 0,
                  }}
                >
                  {/* Unread indicator */}
                  <div
                    className="absolute left-0 top-0 bottom-0 w-0.5"
                    style={{
                      background: `linear-gradient(to bottom, #7c6aff, #38bdf8)`,
                      opacity: notif.read ? 0 : 1,
                    }}
                  />

                  <div className="flex items-start gap-4 p-4 pl-5">
                    {/* Icon */}
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ background: cfg.bg }}
                    >
                      <IconComp size={18} style={{ color: cfg.color }} />
                    </div>

                    {/* User avatar + content */}
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-xs font-bold"
                        style={{ background: `linear-gradient(135deg, #7c6aff, #38bdf8)` }}
                      >
                        {notif.type === `system` ? `⚡` : notif.userAvatar}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-foreground">
                          <span className="font-semibold">{notif.user}</span>
                          <span className="ml-1" style={{ color: `rgba(232,234,246,0.7)` }}>{notif.content}</span>
                        </div>
                        <div className={notif.postTitle ? `mt-1` : `hidden`}>
                          <span
                            className="text-xs px-2 py-1 rounded-lg"
                            style={{ background: `rgba(124,106,255,0.1)`, color: `#a78bfa` }}
                          >
                            《{notif.postTitle}》
                          </span>
                        </div>
                        <div className="text-xs mt-1.5" style={{ color: `rgba(232,234,246,0.35)` }}>
                          {notif.time}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className={notif.read ? `hidden` : ``}>
                        <button
                          onClick={(e) => { e.stopPropagation(); markRead(notif.id); }}
                          className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10"
                          title="标为已读"
                        >
                          <Check size={13} style={{ color: `#34d399` }} />
                        </button>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteItem(notif.id); }}
                        className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10"
                        title="删除"
                      >
                        <Trash2 size={13} style={{ color: `rgba(232,234,246,0.4)` }} />
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
            <div className="text-foreground font-medium mb-2">暂无通知</div>
            <div className="text-sm" style={{ color: `rgba(232,234,246,0.4)` }}>
              继续创作，等待读者的互动吧！
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Notifications;
