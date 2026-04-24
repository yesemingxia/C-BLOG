import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Search, Bell, User, PenSquare, Home, BookOpen,
  LogOut, Settings, ChevronDown, Menu, X
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
      className="fixed top-0 left-0 right-0 z-50"
      style={{
        background: `rgba(5,8,22,0.7)`,
        backdropFilter: `blur(20px) saturate(180%)`,
        WebkitBackdropFilter: `blur(20px) saturate(180%)`,
        borderBottom: `1px solid rgba(255,255,255,0.07)`,
      }}
    >
      <div className="mx-auto px-6" style={{ maxWidth: 1440 }}>
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div
            className="flex items-center gap-2 cursor-pointer flex-shrink-0"
            onClick={() => navigate(`/home`)}
          >
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center animate-pulse-glow"
              style={{
                background: `linear-gradient(135deg, #7c6aff, #38bdf8)`,
              }}
            >
              <span className="text-white font-bold text-sm">B</span>
            </div>
            <span
              className="text-xl font-bold gradient-text"
              style={{ letterSpacing: `-0.02em` }}
            >
              Luminary
            </span>
          </div>

          {/* Center nav links */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <button
                key={link.path}
                onClick={() => navigate(link.path)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all"
                style={{
                  color: isActive(link.path) ? `#7c6aff` : `rgba(232,234,246,0.7)`,
                  background: isActive(link.path) ? `rgba(124,106,255,0.12)` : `transparent`,
                }}
              >
                <link.icon size={15} />
                {link.label}
              </button>
            ))}
          </div>

          {/* Right section */}
          <div className="flex items-center gap-3">
            {/* Search */}
            <form onSubmit={handleSearch} className="hidden md:flex">
              <div className="relative">
                <Search
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2"
                  style={{ color: `rgba(255,255,255,0.35)` }}
                />
                <input
                  type="text"
                  placeholder="搜索文章..."
                  value={searchVal}
                  onChange={(e) => setSearchVal(e.target.value)}
                  className="glass-input pl-9 pr-4 py-2 rounded-xl text-sm"
                  style={{ width: 180 }}
                />
              </div>
            </form>

            <div className={isLoggedIn ? `` : `hidden`}>
              {/* Write button */}
              <button
                onClick={() => navigate(`/write`)}
                className="btn-primary-glass hidden md:flex items-center gap-2 px-4 py-2 rounded-xl text-sm"
              >
                <PenSquare size={15} />
                写文章
              </button>
            </div>

            <div className={isLoggedIn ? `` : `hidden`}>
              {/* Notification */}
              <button
                onClick={() => navigate(`/notifications`)}
                className="relative w-9 h-9 rounded-xl btn-ghost-glass flex items-center justify-center"
              >
                <Bell size={17} style={{ color: `rgba(232,234,246,0.8)` }} />
                <span
                  className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full"
                  style={{ background: `#f472b6` }}
                />
              </button>
            </div>

            <div className={isLoggedIn ? `` : `hidden`}>
              {/* User menu */}
              <div className="relative">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl btn-ghost-glass"
                >
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold"
                    style={{ background: `linear-gradient(135deg, #7c6aff, #f472b6)` }}
                  >
                    U
                  </div>
                  <ChevronDown size={13} style={{ color: `rgba(232,234,246,0.5)` }} />
                </button>

                <div
                  className="absolute right-0 top-12 w-52 glass rounded-2xl overflow-hidden transition-all"
                  style={{
                    opacity: showUserMenu ? 1 : 0,
                    pointerEvents: showUserMenu ? `auto` : `none`,
                    transform: showUserMenu ? `translateY(0)` : `translateY(-8px)`,
                    transition: `all 0.2s ease`,
                  }}
                >
                  <div className="p-3 border-b" style={{ borderColor: `rgba(255,255,255,0.07)` }}>
                    <div className="font-medium text-sm text-foreground">欢迎回来</div>
                    <div className="text-xs" style={{ color: `rgba(255,255,255,0.4)` }}>user@luminary.io</div>
                  </div>
                  <div className="p-2">
                    <button
                      onClick={() => { navigate(`/profile`); setShowUserMenu(false); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-foreground hover:bg-white/5 transition-colors text-left"
                    >
                      <User size={15} />
                      个人主页
                    </button>
                    <button
                      onClick={() => { navigate(`/settings`); setShowUserMenu(false); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-foreground hover:bg-white/5 transition-colors text-left"
                    >
                      <Settings size={15} />
                      设置
                    </button>
                    <hr className="divider-glass my-1" />
                    <button
                      onClick={() => { onLogout(); setShowUserMenu(false); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-colors text-left"
                      style={{ color: `#f87171` }}
                    >
                      <LogOut size={15} />
                      退出登录
                    </button>
                  </div>
                </div>

                {/* Overlay to close */}
                <div
                  className="fixed inset-0"
                  style={{
                    zIndex: -1,
                    pointerEvents: showUserMenu ? `auto` : `none`,
                  }}
                  onClick={() => setShowUserMenu(false)}
                />
              </div>
            </div>

            <div className={isLoggedIn ? `hidden` : ``}>
              <button
                onClick={onLogin}
                className="btn-primary-glass px-5 py-2 rounded-xl text-sm"
              >
                登录
              </button>
            </div>

            {/* Mobile menu toggle */}
            <button
              className="md:hidden btn-ghost-glass w-9 h-9 rounded-xl flex items-center justify-center"
              onClick={() => setShowMobileMenu(!showMobileMenu)}
            >
              <div className={showMobileMenu ? `` : `hidden`}>
                <X size={18} style={{ color: `rgba(232,234,246,0.8)` }} />
              </div>
              <div className={showMobileMenu ? `hidden` : ``}>
                <Menu size={18} style={{ color: `rgba(232,234,246,0.8)` }} />
              </div>
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        <div
          className="md:hidden overflow-hidden transition-all"
          style={{
            maxHeight: showMobileMenu ? `300px` : `0`,
            transition: `max-height 0.3s ease`,
          }}
        >
          <div className="pb-4 flex flex-col gap-1">
            {navLinks.map((link) => (
              <button
                key={link.path}
                onClick={() => { navigate(link.path); setShowMobileMenu(false); }}
                className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm"
                style={{
                  color: isActive(link.path) ? `#7c6aff` : `rgba(232,234,246,0.7)`,
                  background: isActive(link.path) ? `rgba(124,106,255,0.1)` : `transparent`,
                }}
              >
                <link.icon size={16} />
                {link.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
