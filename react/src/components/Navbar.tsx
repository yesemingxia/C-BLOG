import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Search, Bell, User, PenSquare, Home, BookOpen,
  LogOut, Settings, ChevronDown, Menu, X, Sparkles
} from "lucide-react";

interface NavbarProps {
  isLoggedIn?: boolean;
  onLogout?: () => void;
  onLogin?: () => void;
}

const Navbar = ({
  isLoggedIn = true,
  onLogout = () => {},
  onLogin = () => {},
}: NavbarProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [searchVal, setSearchVal] = useState("");

  const navLinks = [
    { label: `首页`, path: `/home`, icon: Home },
    { label: `发现`, path: `/explore`, icon: BookOpen },
  ];

  const isActive = (path: string) => location.pathname === path || (path === `/home` && location.pathname === `/`);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchVal.trim()) {
      navigate(`/search`);
    }
  };

  return (
    <nav
      data-cmp="Navbar"
      className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 backdrop-blur-xl"
      style={{ background: `rgba(var(--background-rgb), 0.7)` }}
    >
      <div className="mx-auto px-6 max-w-[1440px]">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div
            className="flex items-center gap-2 cursor-pointer flex-shrink-0 group"
            onClick={() => navigate(`/home`)}
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-linear-to-br from-[var(--primary)] to-sky-400 shadow-lg shadow-indigo-500/20 group-hover:scale-105 transition-transform duration-300">
              <Sparkles size={18} className="text-white fill-white/20" />
            </div>
            <span className="text-xl font-bold tracking-tight">
              <span className="gradient-text">Luminary</span>
            </span>
          </div>

          {/* Center nav links */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <button
                key={link.path}
                onClick={() => navigate(link.path)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 ${
                  isActive(link.path) 
                    ? "text-[var(--primary)] bg-[var(--primary)]/10 shadow-inner" 
                    : "text-foreground/60 hover:text-foreground hover:bg-white/5"
                }`}
              >
                <link.icon size={16} strokeWidth={isActive(link.path) ? 2.5 : 2} />
                {link.label}
              </button>
            ))}
          </div>

          {/* Right section */}
          <div className="flex items-center gap-4">
            {/* Search */}
            <form onSubmit={handleSearch} className="hidden lg:flex">
              <div className="relative group">
                <Search
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/40 group-focus-within:text-[var(--primary)] transition-colors"
                />
                <input
                  type="text"
                  placeholder="搜索文章..."
                  value={searchVal}
                  onChange={(e) => setSearchVal(e.target.value)}
                  className="glass-input w-48 pl-10 pr-4 py-2 rounded-xl text-sm focus:w-64"
                />
              </div>
            </form>

            {isLoggedIn ? (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => navigate(`/write`)}
                  className="btn-primary-glass hidden md:flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold text-white"
                >
                  <PenSquare size={16} />
                  发布
                </button>

                <button
                  onClick={() => navigate(`/notifications`)}
                  className="relative w-10 h-10 rounded-xl btn-ghost-glass flex items-center justify-center text-foreground/70 hover:text-foreground"
                >
                  <Bell size={18} />
                  <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-pink-500 border-2 border-[var(--background)]" />
                </button>

                <div className="relative">
                  <button
                    onClick={() => setShowUserMenu(!showUserMenu)}
                    className="flex items-center gap-2 p-1 rounded-xl btn-ghost-glass pr-2"
                  >
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-linear-to-br from-[var(--primary)] to-pink-500 text-[10px] font-black text-white shadow-md">
                      JD
                    </div>
                    <ChevronDown size={14} className={`text-foreground/40 transition-transform duration-300 ${showUserMenu ? 'rotate-180' : ''}`} />
                  </button>

                  {showUserMenu && (
                    <>
                      <div className="absolute right-0 top-12 w-56 glass-card p-2 z-[60] animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="px-3 py-3 border-b border-white/5 mb-2">
                          <div className="font-bold text-sm">Jane Doe</div>
                          <div className="text-xs text-foreground/40 truncate">jane.doe@example.com</div>
                        </div>
                        <div className="space-y-1">
                          <button
                            onClick={() => { navigate(`/profile`); setShowUserMenu(false); }}
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm hover:bg-white/5 transition-colors"
                          >
                            <User size={16} /> 个人中心
                          </button>
                          <button
                            onClick={() => { navigate(`/settings`); setShowUserMenu(false); }}
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm hover:bg-white/5 transition-colors"
                          >
                            <Settings size={16} /> 账户设置
                          </button>
                          <div className="h-px bg-white/5 my-1" />
                          <button
                            onClick={() => { onLogout(); setShowUserMenu(false); }}
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                          >
                            <LogOut size={16} /> 退出登录
                          </button>
                        </div>
                      </div>
                      <div className="fixed inset-0 z-50" onClick={() => setShowUserMenu(false)} />
                    </>
                  )}
                </div>
              </div>
            ) : (
              <button
                onClick={onLogin}
                className="btn-primary-glass px-6 py-2 rounded-xl text-sm font-bold text-white shadow-indigo-500/20 shadow-lg"
              >
                立即加入
              </button>
            )}

            <button
              className="md:hidden w-10 h-10 rounded-xl btn-ghost-glass flex items-center justify-center"
              onClick={() => setShowMobileMenu(!showMobileMenu)}
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
                key={link.path}
                onClick={() => { navigate(link.path); setShowMobileMenu(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  isActive(link.path) ? "bg-[var(--primary)]/10 text-[var(--primary)]" : "text-foreground/60"
                }`}
              >
                <link.icon size={18} /> {link.label}
              </button>
            ))}
            {!isLoggedIn && (
              <button
                onClick={onLogin}
                className="w-full btn-primary-glass py-3 rounded-xl text-sm font-bold text-white mt-2"
              >
                登录 / 注册
              </button>
            )}
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
