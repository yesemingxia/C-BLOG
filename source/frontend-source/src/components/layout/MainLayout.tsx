import { useNavigate } from "react-router-dom";
import Navbar from "./Navbar";
import GlassBackground from "./GlassBackground";
import { Home, BookOpen, Sparkles } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";

interface MainLayoutProps {
  children: React.ReactNode;
}

const MainLayout = ({ children }: MainLayoutProps) => {
  const navigate = useNavigate();
  const { isLoggedIn, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen relative flex flex-col">
      <GlassBackground />
      <Navbar isLoggedIn={isLoggedIn} onLogout={handleLogout} onLogin={() => navigate("/login")} />

      <main className="flex-1 relative z-10 pt-16 animate-in fade-in duration-700">
        {children}
      </main>

      <footer className="relative z-10 py-10 border-t border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-xl mt-20">
        <div className="mx-auto px-4 sm:px-6 max-w-[1280px]">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6 mb-8">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[var(--foreground)] flex items-center justify-center">
                <Sparkles size={14} className="text-[var(--background)] fill-[var(--background)]/20" />
              </div>
              <span className="text-lg font-bold text-[var(--foreground)]" style={{ fontFamily: "var(--font-display)" }}>Blog</span>
            </div>

            <ul className="flex items-center gap-6 text-sm text-[var(--muted-foreground)]">
              <li className="hover:text-[var(--foreground)] transition-colors cursor-pointer flex items-center gap-1.5" onClick={() => navigate("/home")}><Home size={14} /> Home</li>
              <li className="hover:text-[var(--foreground)] transition-colors cursor-pointer flex items-center gap-1.5" onClick={() => navigate("/explore")}><BookOpen size={14} /> Explore</li>
            </ul>
          </div>

          <div className="flex flex-col md:flex-row justify-between items-center gap-4 pt-6 border-t border-[var(--border)] text-xs text-[var(--muted-foreground)]">
            <p>&copy; {new Date().getFullYear()} Blog. All rights reserved.</p>
            <div className="flex gap-6">
              <span className="hover:text-[var(--foreground)] transition-colors cursor-pointer">Privacy Policy</span>
              <span className="hover:text-[var(--foreground)] transition-colors cursor-pointer">Terms of Service</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default MainLayout;
