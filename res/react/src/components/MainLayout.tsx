import { useNavigate } from "react-router-dom";
import Navbar from "./Navbar";
import GlassBackground from "./GlassBackground";
import { Github, Twitter, Mail, Heart, Sparkles } from "lucide-react";
import { useAuth } from "./AuthProvider";

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
      <GlassBackground showParticles={true} />
      <Navbar isLoggedIn={isLoggedIn} onLogout={handleLogout} onLogin={() => navigate("/login")} />

      <main className="flex-1 relative z-10 pt-16 animate-in fade-in duration-700">
        {children}
      </main>

      <footer className="relative z-10 py-12 border-t border-white/5 bg-black/10 backdrop-blur-sm mt-20">
        <div className="mx-auto px-4 sm:px-6 max-w-[1280px]">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
            <div className="col-span-1 md:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-linear-to-br from-[var(--neon-purple)] to-[var(--neon-blue)] flex items-center justify-center">
                  <Sparkles size={14} className="text-white fill-white/20" />
                </div>
                <span className="text-lg font-bold gradient-text" style={{ fontFamily: "var(--font-display)" }}>Nova.dev</span>
              </div>
              <p className="text-sm text-foreground/40 leading-relaxed">
                Full-stack developer crafting performant web experiences with clean code and thoughtful design.
              </p>
            </div>

            <div>
              <h4 className="font-semibold text-sm mb-4">Navigation</h4>
              <ul className="space-y-2 text-sm text-foreground/40">
                <li className="hover:text-[var(--neon-purple)] transition-colors cursor-pointer" onClick={() => navigate("/home")}>Home</li>
                <li className="hover:text-[var(--neon-purple)] transition-colors cursor-pointer" onClick={() => navigate("/explore")}>Projects</li>
                <li className="hover:text-[var(--neon-purple)] transition-colors cursor-pointer" onClick={() => navigate("/explore")}>Blog</li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-sm mb-4">Resources</h4>
              <ul className="space-y-2 text-sm text-foreground/40">
                <li className="hover:text-[var(--neon-purple)] transition-colors cursor-pointer">About</li>
                <li className="hover:text-[var(--neon-purple)] transition-colors cursor-pointer">Contact</li>
                <li className="hover:text-[var(--neon-purple)] transition-colors cursor-pointer">Resume</li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-sm mb-4">Connect</h4>
              <div className="flex gap-3">
                <a href="https://github.com" target="_blank" rel="noopener noreferrer" aria-label="GitHub" className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center hover:bg-[var(--neon-purple)]/10 hover:text-[var(--neon-purple)] transition-colors cursor-pointer">
                  <Github size={16} />
                </a>
                <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" aria-label="Twitter" className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center hover:bg-[var(--neon-purple)]/10 hover:text-[var(--neon-purple)] transition-colors cursor-pointer">
                  <Twitter size={16} />
                </a>
                <a href="mailto:hello@novachen.dev" aria-label="Email" className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center hover:bg-[var(--neon-purple)]/10 hover:text-[var(--neon-purple)] transition-colors cursor-pointer">
                  <Mail size={16} />
                </a>
              </div>
            </div>
          </div>

          <div className="flex flex-col md:flex-row justify-between items-center gap-4 pt-8 border-t border-white/5 text-xs text-foreground/30">
            <p className="flex items-center gap-1">
              &copy; 2026 Nova Chen. Built with <Heart size={10} className="text-pink-400 fill-pink-400" /> and lots of coffee.
            </p>
            <div className="flex gap-6">
              <span>Privacy Policy</span>
              <span>Terms of Service</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default MainLayout;
