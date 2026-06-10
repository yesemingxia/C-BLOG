import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, Users, FileText, MessageSquare,
  LogOut, Sparkles, Search, Trash2, Shield, ChevronLeft,
  ChevronRight, TrendingUp, Eye, UserPlus, FileEdit,
  ArrowUpDown, Menu, X
} from "lucide-react";
import { toast } from "sonner";
import GlassBackground from "../components/GlassBackground";
import { adminApi, type AdminStats, type AdminUser, type AdminComment } from "../lib/api";
import type { ApiPost } from "../lib/api";

// @cuiruoni+侧边栏导航项配置：图标+标签+键名
const sidebarItems = [
  { key: "dashboard", label: "仪表盘", icon: LayoutDashboard },
  { key: "users", label: "用户管理", icon: Users },
  { key: "posts", label: "文章管理", icon: FileText },
  { key: "comments", label: "评论管理", icon: MessageSquare },
];

// @cuiruoni+表格行交错动画变体
const rowVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.04, duration: 0.3, ease: "easeOut" as const },
  }),
};

// @cuiruoni+Tab内容切换动画变体
const tabVariants = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
};

// @cuiruoni+数字计数动画组件：从0递增到目标值，使用requestAnimationFrame实现流畅动画
const CountUp = ({ target, duration = 1200 }: { target: number; duration?: number }) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let startTime: number | null = null;
    let rafId: number;

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      // @cuiruoni+使用缓出函数让数字增长更自然
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(eased * target));
      if (progress < 1) {
        rafId = requestAnimationFrame(animate);
      }
    };

    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, [target, duration]);

  return <>{count.toLocaleString()}</>;
};

// @cuiruoni+分页组件
const Pagination = ({ page, totalPages, setPage }: { page: number; totalPages: number; setPage: (p: number) => void }) => {
  if (totalPages <= 1) return null;
  const pages = Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
    const start = Math.max(1, Math.min(page - 2, totalPages - 4));
    return start + i;
  }).filter((p) => p >= 1 && p <= totalPages);

  return (
    <div className="flex items-center justify-center gap-1.5 mt-6">
      <button
        onClick={() => setPage(Math.max(1, page - 1))}
        disabled={page === 1}
        className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-30"
        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(232,234,246,0.7)" }}
      >
        上一页
      </button>
      {pages.map((p) => (
        <button
          key={p}
          onClick={() => setPage(p)}
          className="w-8 h-8 rounded-lg text-xs font-bold transition-all"
          style={{
            background: p === page ? "linear-gradient(135deg, #7c6aff, #38bdf8)" : "rgba(255,255,255,0.05)",
            border: p === page ? "none" : "1px solid rgba(255,255,255,0.08)",
            color: p === page ? "white" : "rgba(232,234,246,0.6)",
          }}
        >
          {p}
        </button>
      ))}
      <button
        onClick={() => setPage(Math.min(totalPages, page + 1))}
        disabled={page === totalPages}
        className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-30"
        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(232,234,246,0.7)" }}
      >
        下一页
      </button>
    </div>
  );
};

// @cuiruoni+搜索输入框组件
const SearchInput = ({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) => (
  <div className="relative">
    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "rgba(232,234,246,0.35)" }} />
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="glass-input w-full pl-10 pr-4 py-2.5 rounded-xl text-sm"
      style={{ fontFamily: "var(--font-display)" }}
    />
  </div>
);

// @cuiruoni+统计卡片配置
const statCardsConfig = [
  { label: "总用户数", icon: Users, color: "#7c6aff", trend: "+12%" },
  { label: "总文章数", icon: FileText, color: "#38bdf8", trend: "+8%" },
  { label: "总评论数", icon: MessageSquare, color: "#34d399", trend: "+23%" },
  { label: "已发布文章", icon: Eye, color: "#f59e0b", trend: "+5%" },
];

// @cuiruoni+仪表盘Tab内容
const DashboardTab = ({ stats }: { stats: AdminStats }) => {
  const statValues = [stats.total_users, stats.total_posts, stats.total_comments, stats.published_posts];

  return (
    <div className="space-y-6">
      {/* 统计卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCardsConfig.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1, duration: 0.4, ease: "easeOut" as const }}
            className="relative overflow-hidden rounded-2xl p-5"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
              backdropFilter: "blur(12px)",
            }}
          >
            {/* 顶部色条 */}
            <div
              className="absolute top-0 left-0 right-0 h-[2px]"
              style={{ background: `linear-gradient(90deg, ${card.color}, transparent)` }}
            />
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs font-medium mb-2" style={{ color: "rgba(232,234,246,0.45)", fontFamily: "var(--font-display)" }}>
                  {card.label}
                </div>
                <div className="text-3xl font-bold" style={{ color: card.color, fontFamily: "var(--font-display)" }}>
                  <CountUp target={statValues[i]} />
                </div>
              </div>
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: `${card.color}15` }}
              >
                <card.icon size={20} style={{ color: card.color }} />
              </div>
            </div>
            <div className="flex items-center gap-1.5 mt-3">
              <TrendingUp size={12} style={{ color: "#34d399" }} />
              <span className="text-xs font-medium" style={{ color: "#34d399", fontFamily: "var(--font-display)" }}>{card.trend}</span>
              <span className="text-xs" style={{ color: "rgba(232,234,246,0.3)", fontFamily: "var(--font-display)" }}>较上月</span>
            </div>
          </motion.div>
        ))}
      </div>

      {/* 图表 + 最近活动 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 文章趋势图 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.4 }}
          className="lg:col-span-2 rounded-2xl p-5"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
            backdropFilter: "blur(12px)",
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold" style={{ color: "rgba(232,234,246,0.8)", fontFamily: "var(--font-display)" }}>
              文章发布趋势
            </h3>
            <span className="text-xs px-2.5 py-1 rounded-lg" style={{ background: "rgba(124,106,255,0.1)", color: "#a78bfa", fontFamily: "var(--font-display)" }}>
              近12个月
            </span>
          </div>
          <div style={{ height: 260 }} className="flex items-center justify-center">
            <div className="text-center">
              <TrendingUp size={40} style={{ color: "rgba(124,106,255,0.4)", margin: "0 auto 12px" }} />
              <p className="text-sm" style={{ color: "rgba(232,234,246,0.5)", fontFamily: "var(--font-display)" }}>
                已发布 {stats.published_posts} 篇文章
              </p>
              <p className="text-xs mt-1" style={{ color: "rgba(232,234,246,0.3)", fontFamily: "var(--font-display)" }}>
                共 {stats.total_posts} 篇，草稿 {stats.draft_posts} 篇
              </p>
            </div>
          </div>
        </motion.div>

        {/* 最近活动 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.4 }}
          className="rounded-2xl p-5"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
            backdropFilter: "blur(12px)",
          }}
        >
          <h3 className="text-sm font-bold mb-4" style={{ color: "rgba(232,234,246,0.8)", fontFamily: "var(--font-display)" }}>
            数据概览
          </h3>
          <div className="space-y-3">
            <div className="flex items-center gap-3 py-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(124,106,255,0.12)" }}>
                <FileEdit size={13} style={{ color: "#7c6aff" }} />
              </div>
              <div className="text-xs" style={{ color: "rgba(232,234,246,0.65)", fontFamily: "var(--font-display)" }}>
                文章总数 <span style={{ color: "rgba(232,234,246,0.9)", fontWeight: 600 }}>{stats.total_posts}</span>，已发布 <span style={{ color: "#a78bfa" }}>{stats.published_posts}</span>
              </div>
            </div>
            <div className="flex items-center gap-3 py-2" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(56,189,248,0.12)" }}>
                <MessageSquare size={13} style={{ color: "#38bdf8" }} />
              </div>
              <div className="text-xs" style={{ color: "rgba(232,234,246,0.65)", fontFamily: "var(--font-display)" }}>
                评论总数 <span style={{ color: "rgba(232,234,246,0.9)", fontWeight: 600 }}>{stats.total_comments}</span>
              </div>
            </div>
            <div className="flex items-center gap-3 py-2" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(52,211,153,0.12)" }}>
                <UserPlus size={13} style={{ color: "#34d399" }} />
              </div>
              <div className="text-xs" style={{ color: "rgba(232,234,246,0.65)", fontFamily: "var(--font-display)" }}>
                注册用户 <span style={{ color: "rgba(232,234,246,0.9)", fontWeight: 600 }}>{stats.total_users}</span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

// @cuiruoni+用户管理Tab内容
const UsersTab = ({
  users, usersTotal, usersPage, usersSearch,
  setUsersSearch, setUsersPage, onToggleRole, onDeleteUser,
}: {
  users: AdminUser[];
  usersTotal: number;
  usersPage: number;
  usersSearch: string;
  setUsersSearch: (v: string) => void;
  setUsersPage: (p: number) => void;
  onToggleRole: (user: AdminUser) => void;
  onDeleteUser: (id: number) => void;
}) => {
  const filteredUsers = usersSearch
    ? users.filter((u) => u.username.toLowerCase().includes(usersSearch.toLowerCase()) || u.email.toLowerCase().includes(usersSearch.toLowerCase()))
    : users;
  const usersTotalPages = Math.ceil(usersTotal / 10);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="w-full sm:w-72">
          <SearchInput value={usersSearch} onChange={setUsersSearch} placeholder="搜索用户名或邮箱..." />
        </div>
        <div className="text-xs" style={{ color: "rgba(232,234,246,0.4)", fontFamily: "var(--font-display)" }}>
          共 {usersTotal} 位用户
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
        <table className="w-full text-sm" style={{ fontFamily: "var(--font-display)" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              {["ID", "用户名", "邮箱", "角色", "注册时间", "操作"].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-xs font-semibold"
                  style={{ color: "rgba(232,234,246,0.4)" }}
                >
                  <div className="flex items-center gap-1">
                    {h}
                    {h !== "操作" && <ArrowUpDown size={10} style={{ opacity: 0.3 }} />}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((user, i) => (
              <motion.tr
                key={user.id}
                custom={i}
                variants={rowVariants}
                initial="hidden"
                animate="visible"
                style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}
                className="transition-colors hover:bg-white/[0.02]"
              >
                <td className="px-4 py-3 text-xs font-mono" style={{ color: "rgba(232,234,246,0.4)" }}>
                  #{user.id}
                </td>
                <td className="px-4 py-3 font-medium" style={{ color: "rgba(232,234,246,0.85)" }}>
                  {user.username}
                </td>
                <td className="px-4 py-3 text-xs" style={{ color: "rgba(232,234,246,0.5)" }}>
                  {user.email}
                </td>
                <td className="px-4 py-3">
                  <span
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold"
                    style={{
                      background: user.role === "admin" ? "rgba(124,106,255,0.12)" : "rgba(56,189,248,0.12)",
                      color: user.role === "admin" ? "#a78bfa" : "#38bdf8",
                      border: `1px solid ${user.role === "admin" ? "rgba(124,106,255,0.2)" : "rgba(56,189,248,0.2)"}`,
                    }}
                  >
                    {user.role === "admin" && <Shield size={10} />}
                    {user.role === "admin" ? "管理员" : "用户"}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs" style={{ color: "rgba(232,234,246,0.4)" }}>
                  {user.created_at}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onToggleRole(user)}
                      className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all hover:opacity-80"
                      style={{
                        background: "rgba(124,106,255,0.1)",
                        border: "1px solid rgba(124,106,255,0.2)",
                        color: "#a78bfa",
                      }}
                    >
                      切换角色
                    </button>
                    <button
                      onClick={() => onDeleteUser(user.id)}
                      className="p-1.5 rounded-lg transition-all hover:opacity-80"
                      style={{
                        background: "rgba(239,68,68,0.08)",
                        border: "1px solid rgba(239,68,68,0.15)",
                        color: "#ef4444",
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={usersPage} totalPages={usersTotalPages} setPage={setUsersPage} />
    </div>
  );
};

// @cuiruoni+文章管理Tab内容
const PostsTab = ({
  posts, postsTotal, postsPage, postsSearch, postsFilter,
  setPostsSearch, setPostsPage, setPostsFilter, onDeletePost,
}: {
  posts: (ApiPost & { status: string })[];
  postsTotal: number;
  postsPage: number;
  postsSearch: string;
  postsFilter: string;
  setPostsSearch: (v: string) => void;
  setPostsPage: (p: number) => void;
  setPostsFilter: (v: string) => void;
  onDeletePost: (id: number) => void;
}) => {
  const postsTotalPages = Math.ceil(postsTotal / 10);
  const filteredPosts = postsSearch
    ? posts.filter((p) => p.title.toLowerCase().includes(postsSearch.toLowerCase()) || (p.author ?? "").toLowerCase().includes(postsSearch.toLowerCase()))
    : posts;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="w-full sm:w-72">
          <SearchInput value={postsSearch} onChange={setPostsSearch} placeholder="搜索文章标题..." />
        </div>
        <div className="flex items-center gap-2">
          {(["all", "published", "draft"] as const).map((status) => (
            <button
              key={status}
              onClick={() => { setPostsFilter(status); setPostsPage(1); }}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{
                background: postsFilter === status ? "rgba(124,106,255,0.15)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${postsFilter === status ? "rgba(124,106,255,0.3)" : "rgba(255,255,255,0.07)"}`,
                color: postsFilter === status ? "#a78bfa" : "rgba(232,234,246,0.5)",
                fontFamily: "var(--font-display)",
              }}
            >
              {status === "all" ? "全部" : status === "published" ? "已发布" : "草稿"}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
        <table className="w-full text-sm" style={{ fontFamily: "var(--font-display)" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              {["ID", "标题", "作者", "状态", "浏览量", "创建时间", "操作"].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-xs font-semibold"
                  style={{ color: "rgba(232,234,246,0.4)" }}
                >
                  <div className="flex items-center gap-1">
                    {h}
                    {h !== "操作" && <ArrowUpDown size={10} style={{ opacity: 0.3 }} />}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredPosts.map((post, i) => (
              <motion.tr
                key={post.id}
                custom={i}
                variants={rowVariants}
                initial="hidden"
                animate="visible"
                style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}
                className="transition-colors hover:bg-white/[0.02]"
              >
                <td className="px-4 py-3 text-xs font-mono" style={{ color: "rgba(232,234,246,0.4)" }}>
                  #{post.id}
                </td>
                <td className="px-4 py-3 font-medium max-w-[200px] truncate" style={{ color: "rgba(232,234,246,0.85)" }}>
                  {post.title}
                </td>
                <td className="px-4 py-3 text-xs" style={{ color: "rgba(232,234,246,0.5)" }}>
                  {post.author}
                </td>
                <td className="px-4 py-3">
                  <span
                    className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold"
                    style={{
                      background: post.status === "published" ? "rgba(52,211,153,0.12)" : "rgba(245,158,11,0.12)",
                      color: post.status === "published" ? "#34d399" : "#f59e0b",
                      border: `1px solid ${post.status === "published" ? "rgba(52,211,153,0.2)" : "rgba(245,158,11,0.2)"}`,
                    }}
                  >
                    {post.status === "published" ? "已发布" : "草稿"}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs font-mono" style={{ color: "rgba(232,234,246,0.5)" }}>
                  {(post.views ?? 0).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-xs" style={{ color: "rgba(232,234,246,0.4)" }}>
                  {post.created_at}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => onDeletePost(post.id)}
                    className="p-1.5 rounded-lg transition-all hover:opacity-80"
                    style={{
                      background: "rgba(239,68,68,0.08)",
                      border: "1px solid rgba(239,68,68,0.15)",
                      color: "#ef4444",
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={postsPage} totalPages={postsTotalPages} setPage={setPostsPage} />
    </div>
  );
};

// @cuiruoni+评论管理Tab内容
const CommentsTab = ({
  comments, commentsTotal, commentsPage, commentsSearch,
  setCommentsSearch, setCommentsPage, onDeleteComment,
}: {
  comments: AdminComment[];
  commentsTotal: number;
  commentsPage: number;
  commentsSearch: string;
  setCommentsSearch: (v: string) => void;
  setCommentsPage: (p: number) => void;
  onDeleteComment: (id: number) => void;
}) => {
  const commentsTotalPages = Math.ceil(commentsTotal / 10);
  const filteredComments = commentsSearch
    ? comments.filter((c) => c.content.toLowerCase().includes(commentsSearch.toLowerCase()) || c.author_name.toLowerCase().includes(commentsSearch.toLowerCase()))
    : comments;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="w-full sm:w-72">
          <SearchInput value={commentsSearch} onChange={setCommentsSearch} placeholder="搜索评论内容或作者..." />
        </div>
        <div className="text-xs" style={{ color: "rgba(232,234,246,0.4)", fontFamily: "var(--font-display)" }}>
          共 {commentsTotal} 条评论
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
        <table className="w-full text-sm" style={{ fontFamily: "var(--font-display)" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              {["ID", "评论内容", "作者", "所属文章", "时间", "操作"].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-xs font-semibold"
                  style={{ color: "rgba(232,234,246,0.4)" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredComments.map((comment, i) => (
              <motion.tr
                key={comment.id}
                custom={i}
                variants={rowVariants}
                initial="hidden"
                animate="visible"
                style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}
                className="transition-colors hover:bg-white/[0.02]"
              >
                <td className="px-4 py-3 text-xs font-mono" style={{ color: "rgba(232,234,246,0.4)" }}>
                  #{comment.id}
                </td>
                <td className="px-4 py-3 max-w-[240px]">
                  <div className="truncate text-xs leading-relaxed" style={{ color: "rgba(232,234,246,0.7)" }}>
                    {comment.content}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs font-medium" style={{ color: "rgba(232,234,246,0.7)" }}>
                  {comment.author_name}
                </td>
                <td className="px-4 py-3 text-xs max-w-[140px] truncate" style={{ color: "#a78bfa" }}>
                  {comment.post_title}
                </td>
                <td className="px-4 py-3 text-xs" style={{ color: "rgba(232,234,246,0.4)" }}>
                  {comment.created_at}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => onDeleteComment(comment.id)}
                    className="p-1.5 rounded-lg transition-all hover:opacity-80"
                    style={{
                      background: "rgba(239,68,68,0.08)",
                      border: "1px solid rgba(239,68,68,0.15)",
                      color: "#ef4444",
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={commentsPage} totalPages={commentsTotalPages} setPage={setCommentsPage} />
    </div>
  );
};

// @cuiruoni+侧边栏内容组件
const SidebarContent = ({
  activeTab, sidebarCollapsed, onTabChange, onToggleCollapse, onLogout, closeMobile,
}: {
  activeTab: string;
  sidebarCollapsed: boolean;
  onTabChange: (tab: string) => void;
  onToggleCollapse: () => void;
  onLogout: () => void;
  closeMobile: () => void;
}) => (
  <div className="flex flex-col h-full">
    {/* Logo */}
    <div
      className="flex items-center gap-2.5 px-4 py-5 cursor-pointer"
      onClick={closeMobile}
    >
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: "linear-gradient(135deg, #7c6aff, #38bdf8)", boxShadow: "0 4px 15px rgba(124,106,255,0.3)" }}
      >
        <Sparkles size={18} className="text-white fill-white/20" />
      </div>
      {!sidebarCollapsed && (
        <span className="text-lg font-bold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
          <span className="gradient-text">Nova</span>
          <span style={{ color: "rgba(232,234,246,0.25)", fontWeight: 500 }}>.admin</span>
        </span>
      )}
    </div>

    {/* 导航项 */}
    <div className="flex-1 px-3 mt-2">
      <div className="space-y-1">
        {sidebarItems.map((item) => {
          const isActive = activeTab === item.key;
          return (
            <button
              key={item.key}
              onClick={() => onTabChange(item.key)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all relative"
              style={{
                background: isActive ? "rgba(124,106,255,0.12)" : "transparent",
                color: isActive ? "#a78bfa" : "rgba(232,234,246,0.55)",
                fontFamily: "var(--font-display)",
              }}
            >
              {isActive && (
                <motion.div
                  layoutId="sidebar-active"
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full"
                  style={{ background: "linear-gradient(180deg, #7c6aff, #38bdf8)" }}
                  transition={{ type: "spring", stiffness: 350, damping: 30 }}
                />
              )}
              <item.icon size={18} strokeWidth={isActive ? 2.5 : 2} />
              {!sidebarCollapsed && <span>{item.label}</span>}
            </button>
          );
        })}
      </div>
    </div>

    {/* 底部折叠/退出 */}
    <div className="px-3 pb-4 space-y-2" style={{ borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 12 }}>
      <button
        onClick={onToggleCollapse}
        className="w-full hidden lg:flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all"
        style={{ color: "rgba(232,234,246,0.4)", fontFamily: "var(--font-display)" }}
      >
        {sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        {!sidebarCollapsed && <span>收起侧栏</span>}
      </button>
      <button
        onClick={onLogout}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all hover:bg-red-500/5"
        style={{ color: "rgba(239,68,68,0.6)", fontFamily: "var(--font-display)" }}
      >
        <LogOut size={18} />
        {!sidebarCollapsed && <span>退出登录</span>}
      </button>
    </div>
  </div>
);

// @cuiruoni+管理后台主组件：左侧导航栏+右侧内容区，4个功能Tab
const Admin = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // @cuiruoni+仪表盘统计数据
  const [stats, setStats] = useState<AdminStats>({
    total_users: 0, total_posts: 0, total_comments: 0, published_posts: 0, draft_posts: 0,
  });

  // @cuiruoni+用户管理状态
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersPage, setUsersPage] = useState(1);
  const [usersSearch, setUsersSearch] = useState("");

  // @cuiruoni+文章管理状态
  const [posts, setPosts] = useState<(ApiPost & { status: string })[]>([]);
  const [postsTotal, setPostsTotal] = useState(0);
  const [postsPage, setPostsPage] = useState(1);
  const [postsSearch, setPostsSearch] = useState("");
  const [postsFilter, setPostsFilter] = useState("all");

  // @cuiruoni+评论管理状态
  const [comments, setComments] = useState<AdminComment[]>([]);
  const [commentsTotal, setCommentsTotal] = useState(0);
  const [commentsPage, setCommentsPage] = useState(1);
  const [commentsSearch, setCommentsSearch] = useState("");

  // @cuiruoni+追踪已加载的Tab，避免重复请求
  const loadedTabs = useRef<Set<string>>(new Set());

  // @cuiruoni+加载统计数据（仅在挂载时执行一次）
  useEffect(() => {
    adminApi.stats().then(setStats);
  }, []);

  // @cuiruoni+加载用户列表
  const loadUsers = useCallback(async () => {
    const res = await adminApi.listUsers(usersPage, 10);
    setUsers(res.users);
    setUsersTotal(res.total);
  }, [usersPage]);

  // @cuiruoni+加载文章列表
  const loadPosts = useCallback(async () => {
    const res = await adminApi.listPosts(postsPage, 10, postsFilter);
    setPosts(res.posts.map((p) => ({ ...p, status: p.status ?? "published" })));
    setPostsTotal(res.total);
  }, [postsPage, postsFilter, postsSearch]);

  // @cuiruoni+加载评论列表
  const loadComments = useCallback(async () => {
    const res = await adminApi.listComments(commentsPage, 10);
    setComments(res.comments);
    setCommentsTotal(res.total);
  }, [commentsPage, commentsSearch]);

  // @cuiruoni+Tab切换时加载数据：通过事件处理函数触发，避免在effect中直接调用setState
  const handleTabChange = useCallback((tab: string) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);

    if (!loadedTabs.current.has(tab)) {
      loadedTabs.current.add(tab);
      if (tab === "users") loadUsers();
      if (tab === "posts") loadPosts();
      if (tab === "comments") loadComments();
    }
  }, [loadUsers, loadPosts, loadComments]);

  // @cuiruoni+操作处理函数
  const handleToggleRole = useCallback(async (user: AdminUser) => {
    const newRole = user.role === "admin" ? "user" : "admin";
    const ok = await adminApi.updateUserRole(user.id, newRole);
    if (ok) {
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, role: newRole } : u)));
      toast.success(`已将 ${user.username} 角色更改为 ${newRole === "admin" ? "管理员" : "普通用户"}`);
    } else {
      toast.error("角色更新失败");
    }
  }, []);

  const handleDeleteUser = useCallback(async (id: number) => {
    const ok = await adminApi.deleteUser(id);
    if (ok) {
      setUsers((prev) => prev.filter((u) => u.id !== id));
      toast.success("用户已删除");
    } else {
      toast.error("删除失败");
    }
  }, []);

  const handleDeletePost = useCallback(async (id: number) => {
    const ok = await adminApi.deletePost(id);
    if (ok) {
      setPosts((prev) => prev.filter((p) => p.id !== id));
      toast.success("文章已删除");
    } else {
      toast.error("删除失败");
    }
  }, []);

  const handleDeleteComment = useCallback(async (id: number) => {
    const ok = await adminApi.deleteComment(id);
    if (ok) {
      setComments((prev) => prev.filter((c) => c.id !== id));
      toast.success("评论已删除");
    } else {
      toast.error("删除失败");
    }
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem("blog_logged_in");
    localStorage.removeItem("blog_token");
    localStorage.removeItem("blog_user");
    navigate("/login");
  }, [navigate]);

  const handleToggleCollapse = useCallback(() => {
    setSidebarCollapsed((prev) => !prev);
  }, []);

  const closeMobile = useCallback(() => {
    setMobileMenuOpen(false);
  }, []);

  // @cuiruoni+初始加载仪表盘数据
  useEffect(() => {
    loadedTabs.current.add("dashboard");
  }, []);

  return (
    <div data-cmp="Admin" className="min-h-screen relative" style={{ fontFamily: "var(--font-display)" }}>
      <GlassBackground showParticles={false} />

      {/* 移动端顶部栏 */}
      <div
        className="lg:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 h-14"
        style={{
          background: "rgba(5,8,22,0.85)",
          backdropFilter: "blur(20px)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #7c6aff, #38bdf8)" }}
          >
            <Sparkles size={15} className="text-white fill-white/20" />
          </div>
          <span className="text-sm font-bold gradient-text">Nova.admin</span>
        </div>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="w-9 h-9 rounded-lg flex items-center justify-center"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          {mobileMenuOpen ? <X size={18} style={{ color: "rgba(232,234,246,0.7)" }} /> : <Menu size={18} style={{ color: "rgba(232,234,246,0.7)" }} />}
        </button>
      </div>

      {/* 移动端侧边栏遮罩 */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="lg:hidden fixed inset-0 z-40"
            style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
            onClick={closeMobile}
          />
        )}
      </AnimatePresence>

      {/* 移动端侧边栏 */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ x: -280 }}
            animate={{ x: 0 }}
            exit={{ x: -280 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="lg:hidden fixed left-0 top-0 bottom-0 z-50 w-[260px]"
            style={{
              background: "rgba(10, 12, 30, 0.95)",
              backdropFilter: "blur(20px)",
              borderRight: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <SidebarContent
              activeTab={activeTab}
              sidebarCollapsed={false}
              onTabChange={handleTabChange}
              onToggleCollapse={handleToggleCollapse}
              onLogout={handleLogout}
              closeMobile={closeMobile}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* 桌面端侧边栏 */}
      <div
        className="hidden lg:block fixed left-0 top-0 bottom-0 z-30 transition-all duration-300"
        style={{
          width: sidebarCollapsed ? 72 : 240,
          background: "rgba(10, 12, 30, 0.85)",
          backdropFilter: "blur(20px)",
          borderRight: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <SidebarContent
          activeTab={activeTab}
          sidebarCollapsed={sidebarCollapsed}
          onTabChange={handleTabChange}
          onToggleCollapse={handleToggleCollapse}
          onLogout={handleLogout}
          closeMobile={closeMobile}
        />
      </div>

      {/* 主内容区 */}
      <div
        className="relative z-10 transition-all duration-300"
        style={{
          marginLeft: typeof window !== "undefined" && window.innerWidth >= 1024 ? (sidebarCollapsed ? 72 : 240) : 0,
          paddingTop: typeof window !== "undefined" && window.innerWidth < 1024 ? 56 : 0,
        }}
      >
        <div className="p-4 sm:p-6 lg:p-8">
          {/* 页面标题 */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between mb-6"
          >
            <div>
              <h1 className="text-xl sm:text-2xl font-bold" style={{ color: "rgba(232,234,246,0.9)" }}>
                {sidebarItems.find((s) => s.key === activeTab)?.label ?? "仪表盘"}
              </h1>
              <p className="text-xs mt-1" style={{ color: "rgba(232,234,246,0.35)" }}>
                管理控制台 / {sidebarItems.find((s) => s.key === activeTab)?.label}
              </p>
            </div>
            <div
              className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs"
              style={{ background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.15)", color: "#34d399" }}
            >
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#34d399", boxShadow: "0 0 6px rgba(52,211,153,0.5)" }} />
              系统运行正常
            </div>
          </motion.div>

          {/* Tab内容 */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              variants={tabVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.25, ease: "easeInOut" as const }}
            >
              {activeTab === "dashboard" && <DashboardTab stats={stats} />}
              {activeTab === "users" && (
                <UsersTab
                  users={users}
                  usersTotal={usersTotal}
                  usersPage={usersPage}
                  usersSearch={usersSearch}
                  setUsersSearch={setUsersSearch}
                  setUsersPage={setUsersPage}
                  onToggleRole={handleToggleRole}
                  onDeleteUser={handleDeleteUser}
                />
              )}
              {activeTab === "posts" && (
                <PostsTab
                  posts={posts}
                  postsTotal={postsTotal}
                  postsPage={postsPage}
                  postsSearch={postsSearch}
                  postsFilter={postsFilter}
                  setPostsSearch={setPostsSearch}
                  setPostsPage={setPostsPage}
                  setPostsFilter={setPostsFilter}
                  onDeletePost={handleDeletePost}
                />
              )}
              {activeTab === "comments" && (
                <CommentsTab
                  comments={comments}
                  commentsTotal={commentsTotal}
                  commentsPage={commentsPage}
                  commentsSearch={commentsSearch}
                  setCommentsSearch={setCommentsSearch}
                  setCommentsPage={setCommentsPage}
                  onDeleteComment={handleDeleteComment}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default Admin;
