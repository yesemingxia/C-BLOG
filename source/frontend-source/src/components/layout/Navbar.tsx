import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Search, Bell, User, PenSquare, Home, BookOpen,
  LogOut, Settings, ChevronDown, Menu, X, Sparkles,
  ShieldCheck, Wand2
} from "lucide-react";
import { useAuth } from "../auth/AuthProvider";

interface NavbarProps {
  isLoggedIn?: boolean;
  onLogout?: () => void;
  onLogin?: () => void;
}

// Preload lazy page chunks on hover to reduce click latency
const prefetchPage = (path: string) => {
  const map: Record<string, () => Promise<unknown>> = {
    "/write": () => import("../../pages/Write"),
    "/profile": () => import("../../pages/Profile"),
    "/settings": () => import("../../pages/Settings"),
    "/notifications": () => import("../../pages/Notifications"),
    "/search": () => import("../../pages/SearchPage"),
    "/admin": () => import("../../pages/Admin"),
    "/style-transfer": () => import("../../pages/StyleTransfer"),
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

  const navLinks = [
    { label: `Home`, path: `/home`, icon: Home },
    { label: `Explore`, path: `/explore`, icon: BookOpen },
    { label: `风格转换`, path: `/style-transfer`, icon: Wand2 },
  ];

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
      className="fixed top-0 left-0 right-0 z-50 border-b border-[var(--glass-border)] backdrop-blur-xl bg-[var(--glass-bg)]"
    >
      <div className="mx-auto px-4 sm:px-6 max-w-[1280px]">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div
            className="flex items-center gap-2.5 cursor-pointer flex-shrink-0 group"
            onClick={() => navigate(`/home`)}
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-[var(--foreground)] shadow-md group-hover:scale-105 transition-transform duration-300">
              <Sparkles size={18} className="text-[var(--background)] fill-[var(--background)]/20" />
            </div>
            <span className="text-xl font-bold tracking-tight text-[var(--foreground)]" style={{ fontFamily: 'var(--font-display)' }}>
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
                    ? "nav-active"
                    : "text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]"
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
                    ? "nav-active"
                    : "text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]"
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
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)] group-focus-within:text-[var(--foreground)] transition-colors"
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
              <div className="flex items-center gap-3">
                <button
                  onClick={() => navigate(`/write`)}
                  onMouseEnter={() => prefetchPage("/write")}
                  className="btn-primary hidden md:flex items-center gap-2 px-5 py-2 rounded-xl text-sm"
                >
                  <PenSquare size={16} />
                  Write
                </button>

                <button
                  onClick={() => navigate(`/notifications`)}
                  onMouseEnter={() => prefetchPage("/notifications")}
                  className="relative w-10 h-10 rounded-xl btn-ghost flex items-center justify-center text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                  aria-label="Notifications"
                >
                  <Bell size={18} />
                </button>

                <div className="relative">
                  <button
                    onClick={() => setShowUserMenu(!showUserMenu)}
                    className="flex items-center gap-2 p-1 rounded-xl btn-ghost pr-2"
                    aria-expanded={showUserMenu}
                    aria-haspopup="true"
                  >
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[var(--foreground)] text-[10px] font-black text-[var(--background)] shadow-md">
                      {initials}
                    </div>
                    <ChevronDown size={14} className={`text-[var(--muted-foreground)] transition-transform duration-300 ${showUserMenu ? 'rotate-180' : ''}`} />
                  </button>

                  {showUserMenu && (
                    <>
                      <div className="absolute right-0 top-12 w-56 card p-2 z-[60] animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="px-3 py-3 border-b border-[var(--border)] mb-2">
                          <div className="font-bold text-sm text-[var(--foreground)]">{user?.username ?? "User"}</div>
                          <div className="text-xs text-[var(--muted-foreground)] truncate">{user?.email ?? ""}</div>
                        </div>
                        <div className="space-y-1">
                          <button
                            onClick={() => { navigate(`/profile/${user?.username ?? ``}`); setShowUserMenu(false); }}
                            onMouseEnter={() => prefetchPage("/profile")}
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
                          >
                            <User size={16} /> Profile
                          </button>
                          <button
                            onClick={() => { navigate(`/settings`); setShowUserMenu(false); }}
                            onMouseEnter={() => prefetchPage("/settings")}
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
                          >
                            <Settings size={16} /> Settings
                          </button>
                          <div className="h-px bg-[var(--border)] my-1" />
                          <button
                            onClick={() => { onLogout(); setShowUserMenu(false); }}
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-[var(--destructive)] hover:bg-[var(--destructive-subtle)] transition-colors"
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
              <button
                onClick={onLogin}
                className="btn-primary px-6 py-2 rounded-xl text-sm font-bold"
              >
                Get Started
              </button>
            )}

            <button
              className="md:hidden w-10 h-10 rounded-xl btn-ghost flex items-center justify-center"
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
                  isActive(link.path)
                    ? "nav-active"
                    : "text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]"
                }`}
              >
                <link.icon size={18} /> {link.label}
              </button>
            ))}
            {isAdmin && (
              <button
                onClick={() => { navigate(`/admin`); setShowMobileMenu(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  location.pathname === `/admin`
                    ? "nav-active"
                    : "text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]"
                }`}
              >
                <ShieldCheck size={18} /> Admin
              </button>
            )}
            {!isLoggedIn && (
              <button
                onClick={onLogin}
                className="w-full btn-primary py-3 rounded-xl text-sm font-bold mt-2"
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
