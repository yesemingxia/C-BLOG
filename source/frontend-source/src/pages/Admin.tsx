import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, Users, FileText, MessageSquare, Mail, Film,
  LogOut, Search, Trash2, Shield, ChevronLeft,
  ChevronRight, TrendingUp, Eye, UserPlus, FileEdit,
  ArrowUpDown, Menu, X, Check
} from "lucide-react";
import { toast } from "sonner";
import "../styles/showcase-stage-pages.css";
import ShowcaseBackdrop from "../showcase/components/ShowcaseBackdrop";
import { useAuth } from "../components/auth/AuthProvider";
import { adminApi, videosApi, checkBackendHealth, type AdminStats, type AdminUser, type AdminComment, type AdminContact, type VideoSubmission } from "../lib/api";
import type { ApiPost } from "../lib/api";

const sidebarItems = [
  { key: "dashboard", label: "仪表盘", icon: LayoutDashboard },
  { key: "users", label: "用户管理", icon: Users },
  { key: "posts", label: "文章管理", icon: FileText },
  { key: "comments", label: "评论管理", icon: MessageSquare },
  { key: "contacts", label: "留言管理", icon: Mail },
  { key: "videos", label: "视频投稿", icon: Film },
];

const rowVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.04, duration: 0.3, ease: "easeOut" as const },
  }),
};

const tabVariants = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
};

const CountUp = ({ target, duration = 1200 }: { target: number; duration?: number }) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let startTime: number | null = null;
    let rafId: number;

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
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
        className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-30 bg-[var(--muted)] border border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--brand-subtle)]"
      >
        上一页
      </button>
      {pages.map((p) => (
        <button
          key={p}
          onClick={() => setPage(p)}
          className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
            p === page
              ? "bg-[var(--foreground)] text-[var(--background)]"
              : "bg-[var(--muted)] border border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--brand-subtle)]"
          }`}
        >
          {p}
        </button>
      ))}
      <button
        onClick={() => setPage(Math.min(totalPages, page + 1))}
        disabled={page === totalPages}
        className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-30 bg-[var(--muted)] border border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--brand-subtle)]"
      >
        下一页
      </button>
    </div>
  );
};

const SearchInput = ({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) => (
  <div className="relative">
    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" />
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="glass-input w-full pl-10 pr-4 py-2.5 rounded-xl text-sm font-display"
    />
  </div>
);

const statCardsConfig = [
  { label: "总用户数", icon: Users },
  { label: "总文章数", icon: FileText },
  { label: "总评论数", icon: MessageSquare },
  { label: "已发布文章", icon: Eye },
];

const DashboardTab = ({ stats }: { stats: AdminStats }) => {
  const statValues = [stats.total_users, stats.total_posts, stats.total_comments, stats.published_posts];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCardsConfig.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1, duration: 0.4, ease: "easeOut" as const }}
            className="relative overflow-hidden rounded-2xl p-5 card"
          >
            <div
              className="absolute top-0 left-0 right-0 h-[2px] bg-[var(--foreground)]"
            />
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs font-medium mb-2 text-[var(--muted-foreground)] font-display">
                  {card.label}
                </div>
                <div className="text-3xl font-bold text-[var(--foreground)] font-display">
                  <CountUp target={statValues[i]} />
                </div>
              </div>
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center bg-[var(--muted)] text-[var(--muted-foreground)]"
              >
                <card.icon size={20} />
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.4 }}
          className="lg:col-span-2 rounded-2xl p-5 card"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-[var(--foreground)] font-display">
              文章发布趋势
            </h3>
            <span className="text-xs px-2.5 py-1 rounded-lg bg-[var(--brand-subtle)] text-[var(--foreground)] font-display">
              近12个月
            </span>
          </div>
          <div style={{ height: 260 }} className="flex items-center justify-center">
            <div className="text-center">
              <TrendingUp size={40} className="text-[var(--muted-foreground)] mx-auto mb-3" />
              <p className="text-sm text-[var(--muted-foreground)] font-display">
                已发布 {stats.published_posts} 篇文章
              </p>
              <p className="text-xs mt-1 text-[var(--muted-foreground)] font-display">
                共 {stats.total_posts} 篇，草稿 {stats.draft_posts} 篇
              </p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.4 }}
          className="rounded-2xl p-5 card"
        >
          <h3 className="text-sm font-bold text-[var(--foreground)] mb-4 font-display">
            数据概览
          </h3>
          <div className="space-y-3">
            <div className="flex items-center gap-3 py-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-[var(--muted)] text-[var(--muted-foreground)]">
                <FileEdit size={13} />
              </div>
              <div className="text-xs text-[var(--muted-foreground)] font-display">
                文章总数 <span className="text-[var(--foreground)] font-semibold">{stats.total_posts}</span>，已发布 <span className="text-[var(--foreground)]">{stats.published_posts}</span>
              </div>
            </div>
            <div className="flex items-center gap-3 py-2 border-t border-[var(--border)]">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-[var(--muted)] text-[var(--muted-foreground)]">
                <MessageSquare size={13} />
              </div>
              <div className="text-xs text-[var(--muted-foreground)] font-display">
                评论总数 <span className="text-[var(--foreground)] font-semibold">{stats.total_comments}</span>
              </div>
            </div>
            <div className="flex items-center gap-3 py-2 border-t border-[var(--border)]">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-[var(--muted)] text-[var(--muted-foreground)]">
                <UserPlus size={13} />
              </div>
              <div className="text-xs text-[var(--muted-foreground)] font-display">
                注册用户 <span className="text-[var(--foreground)] font-semibold">{stats.total_users}</span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

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
        <div className="text-xs text-[var(--muted-foreground)] font-display">
          共 {usersTotal} 位用户
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl card">
        <table className="w-full text-sm font-display">
          <thead>
            <tr className="border-b border-[var(--border)]">
              {["ID", "用户名", "邮箱", "角色", "注册时间", "操作"].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-xs font-semibold text-[var(--muted-foreground)]"
                >
                  <div className="flex items-center gap-1">
                    {h}
                    {h !== "操作" && <ArrowUpDown size={10} className="opacity-30" />}
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
                className="border-b border-[var(--border)] transition-colors hover:bg-[var(--brand-subtle)]"
              >
                <td className="px-4 py-3 text-xs font-mono text-[var(--muted-foreground)]">
                  #{user.id}
                </td>
                <td className="px-4 py-3 font-medium text-[var(--foreground)]">
                  {user.username}
                </td>
                <td className="px-4 py-3 text-xs text-[var(--muted-foreground)]">
                  {user.email}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                      user.role === "admin"
                        ? "bg-[var(--brand-subtle)] text-[var(--foreground)] border-[var(--border-strong)]"
                        : "bg-[var(--muted)] text-[var(--muted-foreground)] border-[var(--border)]"
                    }`}
                  >
                    {user.role === "admin" && <Shield size={10} />}
                    {user.role === "admin" ? "管理员" : "用户"}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-[var(--muted-foreground)]">
                  {user.created_at}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onToggleRole(user)}
                      className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all hover:opacity-80 bg-[var(--brand-subtle)] border border-[var(--border)] text-[var(--foreground)]"
                    >
                      切换角色
                    </button>
                    <button
                      onClick={() => onDeleteUser(user.id)}
                      className="p-1.5 rounded-lg transition-all hover:opacity-80 bg-[var(--destructive-subtle)] border border-[var(--destructive)]/20 text-[var(--destructive)]"
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
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border font-display ${
                postsFilter === status
                  ? "bg-[var(--brand-subtle)] text-[var(--foreground)] border-[var(--border-strong)]"
                  : "bg-[var(--muted)] text-[var(--muted-foreground)] border-[var(--border)] hover:bg-[var(--brand-subtle)]"
              }`}
            >
              {status === "all" ? "全部" : status === "published" ? "已发布" : "草稿"}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl card">
        <table className="w-full text-sm font-display">
          <thead>
            <tr className="border-b border-[var(--border)]">
              {["ID", "标题", "作者", "状态", "浏览量", "创建时间", "操作"].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-xs font-semibold text-[var(--muted-foreground)]"
                >
                  <div className="flex items-center gap-1">
                    {h}
                    {h !== "操作" && <ArrowUpDown size={10} className="opacity-30" />}
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
                className="border-b border-[var(--border)] transition-colors hover:bg-[var(--brand-subtle)]"
              >
                <td className="px-4 py-3 text-xs font-mono text-[var(--muted-foreground)]">
                  #{post.id}
                </td>
                <td className="px-4 py-3 font-medium max-w-[200px] truncate text-[var(--foreground)]">
                  {post.title}
                </td>
                <td className="px-4 py-3 text-xs text-[var(--muted-foreground)]">
                  {post.author}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                      post.status === "published"
                        ? "bg-[var(--success-subtle)] text-[var(--success)] border-[var(--success)]/20"
                        : "bg-[var(--brand-subtle)] text-[var(--muted-foreground)] border-[var(--border)]"
                    }`}
                  >
                    {post.status === "published" ? "已发布" : "草稿"}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs font-mono text-[var(--muted-foreground)]">
                  {(post.views ?? 0).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-xs text-[var(--muted-foreground)]">
                  {post.created_at}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => onDeletePost(post.id)}
                    className="p-1.5 rounded-lg transition-all hover:opacity-80 bg-[var(--destructive-subtle)] border border-[var(--destructive)]/20 text-[var(--destructive)]"
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
        <div className="text-xs text-[var(--muted-foreground)] font-display">
          共 {commentsTotal} 条评论
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl card">
        <table className="w-full text-sm font-display">
          <thead>
            <tr className="border-b border-[var(--border)]">
              {["ID", "评论内容", "作者", "所属文章", "时间", "操作"].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-xs font-semibold text-[var(--muted-foreground)]"
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
                className="border-b border-[var(--border)] transition-colors hover:bg-[var(--brand-subtle)]"
              >
                <td className="px-4 py-3 text-xs font-mono text-[var(--muted-foreground)]">
                  #{comment.id}
                </td>
                <td className="px-4 py-3 max-w-[240px]">
                  <div className="truncate text-xs leading-relaxed text-[var(--muted-foreground)]">
                    {comment.content}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs font-medium text-[var(--muted-foreground)]">
                  {comment.author_name}
                </td>
                <td className="px-4 py-3 text-xs max-w-[140px] truncate text-[var(--foreground)]">
                  {comment.post_title}
                </td>
                <td className="px-4 py-3 text-xs text-[var(--muted-foreground)]">
                  {comment.created_at}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => onDeleteComment(comment.id)}
                    className="p-1.5 rounded-lg transition-all hover:opacity-80 bg-[var(--destructive-subtle)] border border-[var(--destructive)]/20 text-[var(--destructive)]"
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

const ContactsTab = ({
  contacts, contactsTotal, contactsPage, contactsSearch,
  setContactsSearch, setContactsPage, onDeleteContact,
}: {
  contacts: AdminContact[];
  contactsTotal: number;
  contactsPage: number;
  contactsSearch: string;
  setContactsSearch: (v: string) => void;
  setContactsPage: (p: number) => void;
  onDeleteContact: (id: number) => void;
}) => {
  const contactsTotalPages = Math.ceil(contactsTotal / 10);
  const filteredContacts = contactsSearch
    ? contacts.filter((c) => c.message.toLowerCase().includes(contactsSearch.toLowerCase())
        || c.name.toLowerCase().includes(contactsSearch.toLowerCase()))
    : contacts;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="w-full sm:w-72">
          <SearchInput value={contactsSearch} onChange={setContactsSearch} placeholder="搜索姓名或留言内容..." />
        </div>
        <div className="text-xs text-[var(--muted-foreground)] font-display">
          共 {contactsTotal} 条留言
        </div>
      </div>

      {filteredContacts.length === 0 ? (
        <div className="rounded-2xl card p-10 text-center text-sm text-[var(--muted-foreground)] font-display">
          暂无留言 —— 用户在展示页「联系」场景提交的反馈会出现在这里
        </div>
      ) : (
        <div className="space-y-3">
          {filteredContacts.map((c, i) => (
            <motion.div
              key={c.id}
              custom={i}
              variants={rowVariants}
              initial="hidden"
              animate="visible"
              className="rounded-2xl card p-4 sm:p-5"
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <span className="text-sm font-semibold text-[var(--foreground)] font-display">{c.name}</span>
                  <span className="ml-3 text-xs text-[var(--muted-foreground)] font-mono">{c.email}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs text-[var(--muted-foreground)]">{c.created_at}</span>
                  <button
                    onClick={() => onDeleteContact(c.id)}
                    className="p-1.5 rounded-lg transition-all hover:opacity-80 bg-[var(--destructive-subtle)] border border-[var(--destructive)]/20 text-[var(--destructive)]"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              <p className="text-sm leading-relaxed whitespace-pre-wrap text-[var(--muted-foreground)]">
                {c.message}
              </p>
            </motion.div>
          ))}
        </div>
      )}
      <Pagination page={contactsPage} totalPages={contactsTotalPages} setPage={setContactsPage} />
    </div>
  );
};

// @cuiruoni+视频投稿审核：缩略预览 + 通过/驳回/删除（approved 进入主页轮换池）
const VideosTab = ({
  videos, videosTotal, videosPage, videosFilter,
  setVideosFilter, setVideosPage, onSetStatus, onSetActive, onDeleteVideo,
}: {
  videos: VideoSubmission[];
  videosTotal: number;
  videosPage: number;
  videosFilter: string;
  setVideosFilter: (v: string) => void;
  setVideosPage: (p: number) => void;
  onSetStatus: (id: number, status: "approved" | "rejected") => void;
  onSetActive: (id: number, active: boolean) => void;
  onDeleteVideo: (id: number) => void;
}) => {
  const videosTotalPages = Math.ceil(videosTotal / 10);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <p className="text-xs text-[var(--muted-foreground)] font-display">
          共 {videosTotal} 条投稿 —— 安全审核后「启用」其中一支作为主页背景（同一时间只有一支生效）
        </p>
        <div className="flex items-center gap-2">
          {(["all", "pending", "approved", "rejected"] as const).map((s) => (
            <button
              key={s}
              onClick={() => { setVideosFilter(s); setVideosPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border font-display ${
                videosFilter === s
                  ? "bg-[var(--brand-subtle)] text-[var(--foreground)] border-[var(--border-strong)]"
                  : "bg-[var(--muted)] text-[var(--muted-foreground)] border-[var(--border)] hover:bg-[var(--brand-subtle)]"
              }`}
            >
              {s === "all" ? "全部" : s === "pending" ? "待审核" : s === "approved" ? "已通过" : "已驳回"}
            </button>
          ))}
        </div>
      </div>

      {videos.length === 0 ? (
        <div className="rounded-2xl card p-10 text-center text-sm text-[var(--muted-foreground)] font-display">
          暂无投稿 —— 用户在个人中心「投稿视频」上传后会出现在这里
        </div>
      ) : (
        <div className="space-y-3">
          {videos.map((v) => (
            <motion.div
                key={v.id}
                className={`rounded-2xl card p-4 sm:p-5 flex flex-col sm:flex-row gap-4 ${
                  v.is_active ? "ring-1 ring-[var(--primary)]" : ""
                }`}
              >
              <video
                src={`/api/videos/file/${v.filename}`}
                controls
                preload="metadata"
                className="w-full sm:w-56 h-32 rounded-xl bg-black/50 object-cover flex-shrink-0"
              />
              <div className="flex-1 min-w-0 flex flex-col justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold truncate text-[var(--foreground)] font-display">
                    {v.original_name || v.filename}
                  </p>
                  <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                    投稿人 {v.uploader_name || "未知"} · {v.created_at}
                  </p>
                  <span
                    className={`inline-flex mt-2 px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                      v.is_active
                        ? "bg-[var(--brand-subtle)] text-[var(--primary)] border-[var(--brand-border)]"
                        : v.status === "approved"
                          ? "bg-[var(--success-subtle)] text-[var(--success)] border-[var(--success)]/20"
                          : v.status === "rejected"
                            ? "bg-[var(--destructive-subtle)] text-[var(--destructive)] border-[var(--destructive)]/20"
                            : "bg-[var(--muted)] text-[var(--muted-foreground)] border-[var(--border)]"
                    }`}
                  >
                    {v.is_active ? "★ 当前主页背景" : v.status === "approved" ? "已通过，未启用" : v.status === "rejected" ? "已驳回" : "待审核"}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {v.status !== "approved" && (
                    <button
                      onClick={() => onSetStatus(v.id, "approved")}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:opacity-80 bg-[var(--success-subtle)] border border-[var(--success)]/20 text-[var(--success)]"
                    >
                      <Check size={13} /> 通过
                    </button>
                  )}
                  {v.status !== "rejected" && (
                    <button
                      onClick={() => onSetStatus(v.id, "rejected")}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:opacity-80 bg-[var(--muted)] border border-[var(--border)] text-[var(--muted-foreground)]"
                    >
                      <X size={13} /> 驳回
                    </button>
                  )}
                  {!v.is_active && (
                    <button
                      onClick={() => onSetActive(v.id, true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:opacity-80 bg-[var(--brand-subtle)] border border-[var(--brand-border)] text-[var(--primary)]"
                    >
                      <Eye size={13} /> 设为主页背景
                    </button>
                  )}
                  {v.is_active && (
                    <button
                      onClick={() => onSetActive(v.id, false)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:opacity-80 bg-[var(--muted)] border border-[var(--border)] text-[var(--muted-foreground)]"
                    >
                      <X size={13} /> 停用（恢复默认背景）
                    </button>
                  )}
                  <button
                    onClick={() => onDeleteVideo(v.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:opacity-80 bg-[var(--destructive-subtle)] border border-[var(--destructive)]/20 text-[var(--destructive)]"
                  >
                    <Trash2 size={13} /> 删除
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
      <Pagination page={videosPage} totalPages={videosTotalPages} setPage={setVideosPage} />
    </div>
  );
};

const SidebarContent = ({
  activeTab, sidebarCollapsed, onTabChange, onToggleCollapse, onLogout, closeMobile,
}: {
  activeTab: string;
  sidebarCollapsed: boolean;
  onTabChange: (tab: string) => void;
  onToggleCollapse: () => void;
  onLogout: () => void;
  closeMobile: () => void;
}) => {
  const navigate = useNavigate();
  return (
  <div className="flex flex-col h-full">
      <div
        className="flex items-center gap-2.5 px-4 py-5 cursor-pointer hover:opacity-80 transition-opacity"
        onClick={() => { closeMobile(); navigate("/"); }}
      >
        {/* @cuiruoni+品牌位换成站点图标（原 Sparkles 占位圆圈在暗色下是空白的） */}
        <div className="w-9 h-9 rounded-xl overflow-hidden flex-shrink-0 border border-[var(--border)]">
          <img src="/favicon.png" alt="Admin" className="w-full h-full object-cover" />
        </div>
        {!sidebarCollapsed && (
          <span className="text-lg font-bold tracking-tight text-[var(--foreground)] font-display">
            Admin
          </span>
        )}
      </div>

    <div className="flex-1 px-3 mt-2">
      <div className="space-y-1">
        {sidebarItems.map((item) => {
          const isActive = activeTab === item.key;
          return (
            <button
              key={item.key}
              onClick={() => onTabChange(item.key)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all relative font-display ${
                isActive ? "text-[var(--foreground)]" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }`}
              style={{
                background: isActive ? "var(--brand-subtle)" : "transparent",
              }}
            >
              {isActive && (
                <motion.div
                  layoutId="sidebar-active"
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-[var(--foreground)]"
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

    <div className="px-3 pb-4 space-y-2 border-t border-[var(--border)] pt-3">
      <button
        onClick={onToggleCollapse}
        className="w-full hidden lg:flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all text-[var(--muted-foreground)] hover:text-[var(--foreground)] font-display"
      >
        {sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        {!sidebarCollapsed && <span>收起侧栏</span>}
      </button>
      <button
        onClick={onLogout}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all hover:bg-[var(--destructive-subtle)] text-[var(--destructive)] font-display"
      >
        <LogOut size={18} />
        {!sidebarCollapsed && <span>退出登录</span>}
      </button>
    </div>
  </div>
  );
};

const Admin = () => {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [stats, setStats] = useState<AdminStats>({
    total_users: 0, total_posts: 0, total_comments: 0, published_posts: 0, draft_posts: 0,
  });

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersPage, setUsersPage] = useState(1);
  const [usersSearch, setUsersSearch] = useState("");

  const [posts, setPosts] = useState<(ApiPost & { status: string })[]>([]);
  const [postsTotal, setPostsTotal] = useState(0);
  const [postsPage, setPostsPage] = useState(1);
  const [postsSearch, setPostsSearch] = useState("");
  const [postsFilter, setPostsFilter] = useState("all");

  const [comments, setComments] = useState<AdminComment[]>([]);
  const [commentsTotal, setCommentsTotal] = useState(0);
  const [commentsPage, setCommentsPage] = useState(1);
  const [commentsSearch, setCommentsSearch] = useState("");

  const [contacts, setContacts] = useState<AdminContact[]>([]);
  const [contactsTotal, setContactsTotal] = useState(0);
  const [contactsPage, setContactsPage] = useState(1);
  const [contactsSearch, setContactsSearch] = useState("");

  // @cuiruoni+视频投稿审核（方案 C 轮换池）
  const [videoSubs, setVideoSubs] = useState<VideoSubmission[]>([]);
  const [videoSubsTotal, setVideoSubsTotal] = useState(0);
  const [videoSubsPage, setVideoSubsPage] = useState(1);
  const [videosFilter, setVideosFilter] = useState("all");
  const [backendOk, setBackendOk] = useState(true);

  // @cuiruoni+P2修复：健康状态改为真实检测，不再硬编码"系统运行正常"
  useEffect(() => {
    checkBackendHealth().then(setBackendOk);
  }, []);

  useEffect(() => {
    adminApi.stats().then(setStats);
  }, []);

  const loadUsers = useCallback(async () => {
    const res = await adminApi.listUsers(usersPage, 10);
    setUsers(res.users);
    setUsersTotal(res.total);
  }, [usersPage]);

  const loadPosts = useCallback(async () => {
    const res = await adminApi.listPosts(postsPage, 10, postsFilter);
    setPosts(res.posts.map((p) => ({ ...p, status: p.status ?? "published" })));
    setPostsTotal(res.total);
  }, [postsPage, postsFilter]);

  const loadComments = useCallback(async () => {
    const res = await adminApi.listComments(commentsPage, 10);
    setComments(res.comments);
    setCommentsTotal(res.total);
  }, [commentsPage]);

  const loadContacts = useCallback(async () => {
    const res = await adminApi.listContacts(contactsPage, 10);
    setContacts(res.contacts);
    setContactsTotal(res.total);
  }, [contactsPage]);

  const loadVideoSubs = useCallback(async () => {
    const res = await videosApi.adminList(videosFilter, videoSubsPage, 10);
    setVideoSubs(res.videos);
    setVideoSubsTotal(res.total);
  }, [videosFilter, videoSubsPage]);

  // @cuiruoni+P1修复：翻页、切换状态筛选或切换Tab时重新请求数据，修复分页不生效的问题
  useEffect(() => {
    if (activeTab === "users") loadUsers();
  }, [activeTab, usersPage, loadUsers]);

  useEffect(() => {
    if (activeTab === "posts") loadPosts();
  }, [activeTab, postsPage, postsFilter, loadPosts]);

  useEffect(() => {
    if (activeTab === "comments") loadComments();
  }, [activeTab, commentsPage, loadComments]);

  useEffect(() => {
    if (activeTab === "contacts") loadContacts();
  }, [activeTab, contactsPage, loadContacts]);

  useEffect(() => {
    if (activeTab === "videos") loadVideoSubs();
  }, [activeTab, videosFilter, videoSubsPage, loadVideoSubs]);

  const handleTabChange = useCallback((tab: string) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
  }, []);

  const handleToggleRole = useCallback(async (user: AdminUser) => {
    const newRole = user.role === "admin" ? "user" : "admin";
    const actionText = newRole === "admin" ? "设为管理员" : "撤销管理员权限";
    if (!window.confirm(`确定要将 ${user.username} ${actionText} 吗？`)) return;
    try {
      await adminApi.updateUserRole(user.id, newRole);
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, role: newRole } : u)));
      toast.success(`已将 ${user.username} 角色更改为 ${newRole === "admin" ? "管理员" : "普通用户"}`);
    } catch {
      toast.error("角色更新失败");
    }
  }, []);

  const handleDeleteUser = useCallback(async (id: number) => {
    if (!window.confirm("确定要删除该用户吗？此操作不可恢复。")) return;
    try {
      await adminApi.deleteUser(id);
      setUsers((prev) => prev.filter((u) => u.id !== id));
      toast.success("用户已删除");
    } catch {
      toast.error("删除失败");
    }
  }, []);

  const handleDeletePost = useCallback(async (id: number) => {
    if (!window.confirm("确定要删除该文章吗？此操作不可恢复。")) return;
    try {
      await adminApi.deletePost(id);
      setPosts((prev) => prev.filter((p) => p.id !== id));
      toast.success("文章已删除");
    } catch {
      toast.error("删除失败");
    }
  }, []);

  const handleDeleteComment = useCallback(async (id: number) => {
    if (!window.confirm("确定要删除该评论吗？此操作不可恢复。")) return;
    try {
      await adminApi.deleteComment(id);
      setComments((prev) => prev.filter((c) => c.id !== id));
      toast.success("评论已删除");
    } catch {
      toast.error("删除失败");
    }
  }, []);

  const handleDeleteContact = useCallback(async (id: number) => {
    if (!window.confirm("确定要删除该留言吗？此操作不可恢复。")) return;
    try {
      await adminApi.deleteContact(id);
      setContacts((prev) => prev.filter((c) => c.id !== id));
      setContactsTotal((t) => Math.max(0, t - 1));
      toast.success("留言已删除");
    } catch {
      toast.error("删除失败");
    }
  }, []);

  // @cuiruoni+视频投稿审核：通过/驳回（驳回自动停用）
  const handleVideoStatus = useCallback(async (id: number, status: "approved" | "rejected") => {
    try {
      await videosApi.setStatus(id, status);
      setVideoSubs((prev) => prev.map((v) => {
        if (v.id !== id) return v;
        return status === "approved" ? { ...v, status } : { ...v, status, is_active: false };
      }));
      toast.success(status === "approved" ? "已通过" : "已驳回");
    } catch {
      toast.error("操作失败");
    }
  }, []);

  // @cuiruoni+启用/停用当前主页背景（全局唯一；启用时自动通过）
  const handleVideoActive = useCallback(async (id: number, active: boolean) => {
    try {
      await videosApi.setActive(id, active);
      setVideoSubs((prev) => prev.map((v) => {
        if (v.id === id) return { ...v, is_active: active, status: active ? "approved" : v.status };
        // 启用某支时其他支自动退出启用态
        return active ? { ...v, is_active: false } : v;
      }));
      toast.success(active ? "已设为主页背景" : "已停用，主页恢复默认背景");
    } catch {
      toast.error("操作失败");
    }
  }, []);

  const handleDeleteVideoSub = useCallback(async (id: number) => {
    if (!window.confirm("确定要删除这条投稿吗？视频文件将一并删除。")) return;
    try {
      await videosApi.remove(id);
      setVideoSubs((prev) => prev.filter((v) => v.id !== id));
      setVideoSubsTotal((t) => Math.max(0, t - 1));
      toast.success("投稿已删除");
    } catch {
      toast.error("删除失败");
    }
  }, []);

  const handleLogout = useCallback(async () => {
    await logout();
    navigate("/login");
  }, [logout, navigate]);

  const handleToggleCollapse = useCallback(() => {
    setSidebarCollapsed((prev) => !prev);
  }, []);

  const closeMobile = useCallback(() => {
    setMobileMenuOpen(false);
  }, []);

  return (
    <div data-cmp="Admin" className="min-h-screen relative bg-background font-display dark stage-page">
      {/* 背景换成 showcase 的舞台（与展示页同一套风格）。
          dim 0.55：这一屏是表格与数字，背景要压得比登录页更暗才读得清。 */}
      <ShowcaseBackdrop dim={0.55} source="scene2" />

      {/* 移动端顶部栏 */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 h-14 bg-[var(--background)]/85 backdrop-blur-xl border-b border-[var(--border)]">
        <div
          className="flex items-center gap-2.5 cursor-pointer hover:opacity-80 transition-opacity"
          onClick={() => navigate("/")}
        >
          <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0 border border-[var(--border)]">
            <img src="/favicon.png" alt="Admin" className="w-full h-full object-cover" />
          </div>
          <span className="text-sm font-bold text-[var(--foreground)]">Admin</span>
        </div>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="w-9 h-9 rounded-lg flex items-center justify-center bg-[var(--muted)] border border-[var(--border)]"
        >
          {mobileMenuOpen ? <X size={18} className="text-[var(--muted-foreground)]" /> : <Menu size={18} className="text-[var(--muted-foreground)]" />}
        </button>
      </div>

      {/* 移动端侧边栏遮罩 */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="lg:hidden fixed inset-0 z-40 bg-[var(--foreground)]/30 backdrop-blur-sm"
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
            className="lg:hidden fixed left-0 top-0 bottom-0 z-50 w-[260px] bg-[var(--background)]/95 backdrop-blur-xl border-r border-[var(--border)]"
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
        className="hidden lg:block fixed left-0 top-0 bottom-0 z-30 transition-all duration-300 bg-[var(--card)] border-r border-[var(--border)]"
        style={{ width: sidebarCollapsed ? 72 : 240 }}
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
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between mb-6"
          >
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-[var(--foreground)]">
                {sidebarItems.find((s) => s.key === activeTab)?.label ?? "仪表盘"}
              </h1>
              <p className="text-xs mt-1 text-[var(--muted-foreground)]">
                管理控制台 / {sidebarItems.find((s) => s.key === activeTab)?.label}
              </p>
            </div>
            <div className={`hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs border ${backendOk ? "bg-[var(--success-subtle)] border-[var(--success)]/15 text-[var(--success)]" : "bg-[var(--destructive-subtle)] border-[var(--destructive)]/20 text-[var(--destructive)]"}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${backendOk ? "bg-[var(--success)]" : "bg-[var(--destructive)]"}`} />
              {backendOk ? "系统运行正常" : "后端连接异常"}
            </div>
          </motion.div>

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
              {activeTab === "contacts" && (
                <ContactsTab
                  contacts={contacts}
                  contactsTotal={contactsTotal}
                  contactsPage={contactsPage}
                  contactsSearch={contactsSearch}
                  setContactsSearch={setContactsSearch}
                  setContactsPage={setContactsPage}
                  onDeleteContact={handleDeleteContact}
                />
              )}
              {activeTab === "videos" && (
                <VideosTab
                  videos={videoSubs}
                  videosTotal={videoSubsTotal}
                  videosPage={videoSubsPage}
                  videosFilter={videosFilter}
                  setVideosFilter={setVideosFilter}
                  setVideosPage={setVideoSubsPage}
                  onSetStatus={handleVideoStatus}
                  onSetActive={handleVideoActive}
                  onDeleteVideo={handleDeleteVideoSub}
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
