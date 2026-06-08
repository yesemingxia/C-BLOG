import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Search, Bell, User, PenSquare, Home, BookOpen,
  LogOut, Settings, ChevronDown, Menu, X, Sparkles, Layers,
  Sun, Moon
} from "lucide-react";
import { useTheme } from "./ThemeProvider";

interface NavbarProps {
  isLoggedIn?: boolean;
  onLogout?: () => void;
  onLogin?: () => void;
}

// @cuiruoni+导航栏组件：固定顶部，包含Logo、导航链接、搜索、主题切换、用户菜单，支持移动端汉堡菜单
const Navbar = ({
  isLoggedIn = true,
  onLogout = () => {},
  onLogin = () => {},
}: NavbarProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isDark, toggleTheme } = useTheme();
  // @cuiruoni+控制用户下拉菜单和移动端菜单的展开/收起
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [searchVal, setSearchVal] = useState("");

  // @cuiruoni+从localStorage读取当前登录用户信息
  const [userInfo, setUserInfo] = useState<{ username: string; email: string } | null>(() => {
    try {
      const raw = localStorage.getItem("blog_user");
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });

  useEffect(() => {
    const sync = () => {
      try {
        const raw = localStorage.getItem("blog_user");
        setUserInfo(raw ? JSON.parse(raw) : null);
      } catch { setUserInfo(null); }
    };
    window.addEventListener("auth-change", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("auth-change", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  // @cuiruoni+用户名首字母缩写，用于头像显示
  const initials = userInfo?.username
    ? userInfo.username.slice(0, 2).toUpperCase()
    : "U";

  // @cuiruoni+主导航链接配置，每个链接对应一个路由和图标
  const navLinks = [
    { label: `Home`, path: `/home`, icon: Home },
    { label: `Projects`, path: `/explore`, icon: Layers },
    { label: `Blog`, path: `/explore`, icon: BookOpen },
  ];

  // @cuiruoni+判断当前路由是否激活，用于高亮导航项
  const isActive = (path: string) => location.pathname === path || (path === `/home` && location.pathname === `/`);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchVal.trim()) {
      navigate(`/search`);
    }
  };

  // @cuiruoni+跨页面锚点滚动：如果当前不在首页则先导航再延迟滚动
  const scrollToSection = (id: string) => {
    if (location.pathname !== `/home` && location.pathname !== `/`) {
      navigate(`/home`);
      setTimeout(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
      }, 300);
    } else {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <nav
      data-cmp="Navbar"
      className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 backdrop-blur-xl"
      style={{ background: `rgba(var(--background-rgb), 0.7)` }}
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
            <span className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
              <span className="gradient-text">Nova</span>
              <span className="text-foreground/30 font-medium ml-0.5">.dev</span>
            </span>
          </div>

          {/* Center nav links */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <button
                key={link.label}
                onClick={() => navigate(link.path)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 ${
                  isActive(link.path)
                    ? "text-[var(--neon-purple)] bg-[var(--neon-purple)]/10 shadow-inner"
                    : "text-foreground/60 hover:text-foreground hover:bg-white/5"
                }`}
              >
                <link.icon size={16} strokeWidth={isActive(link.path) ? 2.5 : 2} />
                {link.label}
              </button>
            ))}
            <button
              onClick={() => scrollToSection("about")}
              className="px-4 py-2 rounded-xl text-sm font-medium text-foreground/40 hover:text-foreground hover:bg-white/5 transition-all duration-300"
            >
              About
            </button>
            <button
              onClick={() => scrollToSection("contact")}
              className="px-4 py-2 rounded-xl text-sm font-medium text-foreground/40 hover:text-foreground hover:bg-white/5 transition-all duration-300"
            >
              Contact
            </button>
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

            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              className="w-10 h-10 rounded-xl btn-ghost-glass flex items-center justify-center text-foreground/60 hover:text-foreground transition-all"
              aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
              title={isDark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            {isLoggedIn ? (
              // @cuiruoni+已登录状态：显示写文章按钮、通知铃铛、用户头像下拉菜单
              <div className="flex items-center gap-3">
                <button
                  onClick={() => navigate(`/write`)}
                  className="btn-primary-glass hidden md:flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold text-white"
                >
                  <PenSquare size={16} />
                  Write
                </button>

                <button
                  onClick={() => navigate(`/notifications`)}
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
                        <div className="px-3 py-3 border-b border-white/5 mb-2">
                          <div className="font-bold text-sm">{userInfo?.username ?? "User"}</div>
                          <div className="text-xs text-foreground/40 truncate">{userInfo?.email ?? ""}</div>
                        </div>
                        <div className="space-y-1">
                          <button
                            onClick={() => { navigate(`/profile`); setShowUserMenu(false); }}
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm hover:bg-white/5 transition-colors"
                          >
                            <User size={16} /> Profile
                          </button>
                          <button
                            onClick={() => { navigate(`/settings`); setShowUserMenu(false); }}
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm hover:bg-white/5 transition-colors"
                          >
                            <Settings size={16} /> Settings
                          </button>
                          <div className="h-px bg-white/5 my-1" />
                          <button
                            onClick={() => { onLogout(); setShowUserMenu(false); }}
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-red-400 hover:bg-red-500/10 transition-colors"
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
            <button
              onClick={() => { scrollToSection("about"); setShowMobileMenu(false); }}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-foreground/60"
            >
              About
            </button>
            <button
              onClick={() => { scrollToSection("contact"); setShowMobileMenu(false); }}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-foreground/60"
            >
              Contact
            </button>
            {/* Mobile theme toggle */}
            <button
              onClick={() => { toggleTheme(); }}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-foreground/60"
            >
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
              {isDark ? "Light Mode" : "Dark Mode"}
            </button>
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
