import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Search, Bell, User, PenSquare, Home, BookOpen,
  LogOut, Settings, ChevronDown, Menu, X, Sparkles,
  ShieldCheck
} from "lucide-react";
import { useAuth } from "../auth/AuthProvider";

interface NavbarProps {
  isLoggedIn?: boolean;
  onLogout?: () => void;
  onLogin?: () => void;
}

// 预加载懒加载页面 chunk，鼠标悬停时静默拉取，减少后续点击延迟
const prefetchPage = (path: string) => {
  const map: Record<string, () => Promise<unknown>> = {
    "/write": () => import("../../pages/Write"),
    "/profile": () => import("../../pages/Profile"),
    "/settings": () => import("../../pages/Settings"),
    "/notifications": () => import("../../pages/Notifications"),
    "/search": () => import("../../pages/SearchPage"),
    "/admin": () => import("../../pages/Admin"),
  };
  const loader = map[path];
  if (loader) loader().catch(() => {});
};

const Navbar = ({
  isLoggedIn = true,
  onLogout = () => {},
  onLogin = () => {},
}: NavbarProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [searchVal, setSearchVal] = useState("");

  const initials = user?.username
    ? user.username.slice(0, 2).toUpperCase()
    : "U";

  const isAdmin = user?.role === "admin";

  // 主导航链接配置，每个链接对应一个路由和图标
  const navLinks = [
    { label: `Home`, path: `/home`, icon: Home },
    { label: `Explore`, path: `/explore`, icon: BookOpen },
  ];

  // 判断当前路由是否激活，用于高亮导航项
  const isActive = (path: string) => location.pathname === path || (path === `/home` && location.pathname === `/`);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchVal.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchVal.trim())}`);
    }
  };

  return (
    <nav
      data-cmp="Navbar"
      className="fixed top-0 left-0 right-0 z-50 border-b border-foreground/5 backdrop-blur-xl bg-background/70"
    >
      <div className="mx-auto px-4 sm:px-6 max-w-[1280px]">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div
            className="flex items-center gap-2.5 cursor-pointer flex-shrink-0 group"
            onClick={() => navigate(`/home`)}
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-linear-to-br from-[var(--neon-purple)] to-[var(--neon-blue)] shadow-lg shadow-purple-500/20 group-hover:scale-105 transition-transform duration-300">
              <Sparkles size={18} className="text-white fill-white/20" />
            </div>
            <span className="text-xl font-bold tracking-tight text-foreground" style={{ fontFamily: 'var(--font-display)' }}>
              Blog
            </span>
          </div>

          {/* Center nav links */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <button
                key={link.label}
                onClick={() => navigate(link.path)}
                onMouseEnter={() => prefetchPage(link.path)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                  isActive(link.path)
                    ? "text-[var(--primary)] bg-[var(--primary)]/10 shadow-inner"
                    : "text-foreground/60 hover:text-foreground hover:bg-foreground/5"
                }`}
              >
                <link.icon size={16} strokeWidth={isActive(link.path) ? 2.5 : 2} />
                {link.label}
              </button>
            ))}
            {isAdmin && (
              <button
                onClick={() => navigate(`/admin`)}
                onMouseEnter={() => prefetchPage("/admin")}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                  location.pathname === `/admin`
                    ? "text-[var(--primary)] bg-[var(--primary)]/10 shadow-inner"
                    : "text-foreground/60 hover:text-foreground hover:bg-foreground/5"
                }`}
              >
                <ShieldCheck size={16} />
                Admin
              </button>
            )}
          </div>

          {/* Right section */}
          <div className="flex items-center gap-3">
            {/* Search */}
            <form onSubmit={handleSearch} className="hidden lg:flex">
              <div className="relative group">
                <Search
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/40 group-focus-within:text-[var(--neon-purple)] transition-colors"
                />
                <input
                  type="text"
                  placeholder="Search posts..."
                  value={searchVal}
                  onChange={(e) => setSearchVal(e.target.value)}
                  className="glass-input w-44 pl-10 pr-4 py-2 rounded-xl text-sm focus:w-56"
                />
              </div>
            </form>

            {isLoggedIn ? (
              // @cuiruoni+已登录状态：显示写文章按钮、通知铃铛、用户头像下拉菜单
              <div className="flex items-center gap-3">
                <button
                  onClick={() => navigate(`/write`)}
                  onMouseEnter={() => prefetchPage("/write")}
                  className="btn-primary-glass hidden md:flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold text-white"
                >
                  <PenSquare size={16} />
                  Write
                </button>

                <button
                  onClick={() => navigate(`/notifications`)}
                  onMouseEnter={() => prefetchPage("/notifications")}
                  className="relative w-10 h-10 rounded-xl btn-ghost-glass flex items-center justify-center text-foreground/70 hover:text-foreground"
                  aria-label="Notifications"
                >
                  <Bell size={18} />
                  <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-pink-500 border-2 border-[var(--background)]" />
                </button>

                <div className="relative">
                  <button
                    onClick={() => setShowUserMenu(!showUserMenu)}
                    className="flex items-center gap-2 p-1 rounded-xl btn-ghost-glass pr-2"
                    aria-expanded={showUserMenu}
                    aria-haspopup="true"
                  >
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-linear-to-br from-[var(--neon-purple)] to-[var(--neon-blue)] text-[10px] font-black text-white shadow-md">
                      {initials}
                    </div>
                    <ChevronDown size={14} className={`text-foreground/40 transition-transform duration-300 ${showUserMenu ? 'rotate-180' : ''}`} />
                  </button>

                  {showUserMenu && (
                    <>
                      <div className="absolute right-0 top-12 w-56 bento-card p-2 z-[60] animate-in fade-in slide-in-from-top-2 duration-300">
                          <div className="px-3 py-3 border-b border-foreground/5 mb-2">
                            <div className="font-bold text-sm">{user?.username ?? "User"}</div>
                            <div className="text-xs text-foreground/40 truncate">{user?.email ?? ""}</div>
                          </div>
                        <div className="space-y-1">
                          <button
                            onClick={() => { navigate(`/profile`); setShowUserMenu(false); }}
                            onMouseEnter={() => prefetchPage("/profile")}
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm hover:bg-foreground/5 transition-colors"
                          >
                            <User size={16} /> Profile
                          </button>
                          <button
                            onClick={() => { navigate(`/settings`); setShowUserMenu(false); }}
                            onMouseEnter={() => prefetchPage("/settings")}
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm hover:bg-foreground/5 transition-colors"
                          >
                            <Settings size={16} /> Settings
                          </button>
                          <div className="h-px bg-foreground/5 my-1" />
                          <button
                            onClick={() => { onLogout(); setShowUserMenu(false); }}
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-red-500 hover:bg-red-500/10 transition-colors"
                          >
                            <LogOut size={16} /> Sign Out
                          </button>
                        </div>
                      </div>
                      <div className="fixed inset-0 z-50" onClick={() => setShowUserMenu(false)} />
                    </>
                  )}
                </div>
              </div>
            ) : (
              // @cuiruoni+未登录状态：显示"Get Started"按钮引导用户登录
              <button
                onClick={onLogin}
                className="btn-primary-glass px-6 py-2 rounded-xl text-sm font-bold text-white shadow-purple-500/20 shadow-lg"
              >
                Get Started
              </button>
            )}

            <button
              className="md:hidden w-10 h-10 rounded-xl btn-ghost-glass flex items-center justify-center"
              onClick={() => setShowMobileMenu(!showMobileMenu)}
              aria-label="Toggle menu"
            >
              {showMobileMenu ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {showMobileMenu && (
          <div className="md:hidden py-4 space-y-2 animate-in slide-in-from-top duration-300">
            {navLinks.map((link) => (
              <button
                key={link.label}
                onClick={() => { navigate(link.path); setShowMobileMenu(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  isActive(link.path) ? "bg-[var(--neon-purple)]/10 text-[var(--neon-purple)]" : "text-foreground/60"
                }`}
              >
                <link.icon size={18} /> {link.label}
              </button>
            ))}
            {isAdmin && (
              <button
                onClick={() => { navigate(`/admin`); setShowMobileMenu(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  location.pathname === `/admin` ? "bg-[var(--neon-purple)]/10 text-[var(--neon-purple)]" : "text-foreground/60"
                }`}
              >
                <ShieldCheck size={18} /> Admin
              </button>
            )}
            {!isLoggedIn && (
              <button
                onClick={onLogin}
                className="w-full btn-primary-glass py-3 rounded-xl text-sm font-bold text-white mt-2"
              >
                Get Started
              </button>
            )}
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
