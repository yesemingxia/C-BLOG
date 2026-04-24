import React, { useState } from "react";
import Navbar from "./Navbar";
import GlassBackground from "./GlassBackground";
import { useNavigate } from "react-router-dom";

interface MainLayoutProps {
  children: React.ReactNode;
}

const MainLayout = ({ children }: MainLayoutProps) => {
  const navigate = useNavigate();
  const [isLoggedIn, setIsLoggedIn] = useState(() => !!localStorage.getItem("blog_logged_in"));

  const handleLogout = () => {
    localStorage.removeItem("blog_logged_in");
    setIsLoggedIn(false);
    navigate("/login");
  };

  const handleLogin = () => {
    navigate("/login");
  };

  return (
    <div className="min-h-screen relative flex flex-col">
      <GlassBackground showParticles={true} />
      
      <Navbar 
        isLoggedIn={isLoggedIn} 
        onLogout={handleLogout} 
        onLogin={handleLogin} 
      />

      <main className="flex-1 relative z-10 pt-16 animate-in fade-in duration-700">
        {children}
      </main>

      <footer className="relative z-10 py-12 border-t border-white/5 bg-black/10 backdrop-blur-sm mt-20">
        <div className="mx-auto px-6 max-w-[1440px]">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
            <div className="col-span-1 md:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-linear-to-br from-[var(--primary)] to-sky-400 flex items-center justify-center">
                  <span className="text-white font-black text-xs">B</span>
                </div>
                <span className="text-lg font-bold gradient-text">Luminary</span>
              </div>
              <p className="text-sm text-foreground/40 leading-relaxed">
                激发创意，连接思想。Luminary 是创作者记录见解、分享灵感的数字化乐园。
              </p>
            </div>
            
            <div>
              <h4 className="font-semibold text-sm mb-4">探索</h4>
              <ul className="space-y-2 text-sm text-foreground/40">
                <li className="hover:text-[var(--primary)] transition-colors cursor-pointer">技术前沿</li>
                <li className="hover:text-[var(--primary)] transition-colors cursor-pointer">设计美学</li>
                <li className="hover:text-[var(--primary)] transition-colors cursor-pointer">人工智能</li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold text-sm mb-4">平台</h4>
              <ul className="space-y-2 text-sm text-foreground/40">
                <li className="hover:text-[var(--primary)] transition-colors cursor-pointer">关于我们</li>
                <li className="hover:text-[var(--primary)] transition-colors cursor-pointer">创作者指南</li>
                <li className="hover:text-[var(--primary)] transition-colors cursor-pointer">隐私政策</li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold text-sm mb-4">关注我们</h4>
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors cursor-pointer">
                  <span className="text-xs">GH</span>
                </div>
                <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors cursor-pointer">
                  <span className="text-xs">TW</span>
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 pt-8 border-t border-white/5 text-xs text-foreground/30">
            <p>© 2026 Luminary. Built with passion for creators.</p>
            <div className="flex gap-6">
              <span>沪ICP备 88888888号</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default MainLayout;
