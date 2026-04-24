import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, Mail, Lock, User, Sparkles, ArrowRight, Github, Twitter } from "lucide-react";
import GlassBackground from "../components/GlassBackground";
import { toast } from "sonner";

const Login = () => {
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [showPwd, setShowPwd] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTimeout(() => setMounted(true), 100);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      toast.success(isLogin ? `登录成功，欢迎回来！` : `注册成功，欢迎加入！`);
      localStorage.setItem(`blog_logged_in`, `true`);
      navigate(`/`);
    }, 1500);
  };

  return (
    <div
      data-cmp="Login"
      className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{ minHeight: `100vh` }}
    >
      <GlassBackground showParticles={true} />

      {/* Decorative floating elements */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: `15%`, left: `8%`, width: 180, height: 180,
          background: `rgba(124,106,255,0.08)`,
          border: `1px solid rgba(124,106,255,0.15)`,
          borderRadius: `38% 62% 45% 55% / 48% 35% 65% 52%`,
          backdropFilter: `blur(8px)`,
          animation: `orb-float 7s ease-in-out infinite`,
        }}
      />
      <div
        className="absolute pointer-events-none"
        style={{
          bottom: `20%`, right: `6%`, width: 140, height: 140,
          background: `rgba(56,189,248,0.06)`,
          border: `1px solid rgba(56,189,248,0.12)`,
          borderRadius: `55% 45% 60% 40% / 40% 60% 40% 60%`,
          backdropFilter: `blur(8px)`,
          animation: `orb-float 9s ease-in-out infinite`,
          animationDelay: `-4s`,
        }}
      />
      <div
        className="absolute pointer-events-none"
        style={{
          top: `60%`, left: `5%`, width: 90, height: 90,
          background: `rgba(244,114,182,0.06)`,
          border: `1px solid rgba(244,114,182,0.12)`,
          borderRadius: `50%`,
          backdropFilter: `blur(8px)`,
          animation: `orb-float 6s ease-in-out infinite`,
          animationDelay: `-2s`,
        }}
      />

      {/* Floating text decorations */}
      <div
        className="absolute hidden lg:block pointer-events-none"
        style={{ top: `25%`, left: `10%`, opacity: 0.12, transform: `rotate(-15deg)`, fontSize: 64, fontWeight: 900, color: `#7c6aff` }}
      >
        &lt;/&gt;
      </div>
      <div
        className="absolute hidden lg:block pointer-events-none"
        style={{ bottom: `25%`, right: `10%`, opacity: 0.1, transform: `rotate(12deg)`, fontSize: 48, fontWeight: 900, color: `#38bdf8` }}
      >
        ✦
      </div>

      {/* Main card */}
      <div
        className="relative z-10 w-full"
        style={{
          maxWidth: 460,
          padding: `0 1.5rem`,
          opacity: mounted ? 1 : 0,
          transform: mounted ? `translateY(0)` : `translateY(24px)`,
          transition: `all 0.7s cubic-bezier(0.16, 1, 0.3, 1)`,
        }}
      >
        <div
          className="relative overflow-hidden rounded-3xl"
          style={{
            background: `rgba(255,255,255,0.05)`,
            backdropFilter: `blur(40px) saturate(180%)`,
            WebkitBackdropFilter: `blur(40px) saturate(180%)`,
            border: `1px solid rgba(255,255,255,0.1)`,
            boxShadow: `0 32px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)`,
          }}
        >
          {/* Top shine line */}
          <div
            className="absolute top-0 left-0 right-0 h-px"
            style={{ background: `linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)` }}
          />
          {/* Background glow inside card */}
          <div
            className="absolute pointer-events-none"
            style={{
              top: `-60px`, left: `50%`, transform: `translateX(-50%)`,
              width: 300, height: 300,
              background: `radial-gradient(circle, rgba(124,106,255,0.12), transparent 70%)`,
            }}
          />

          <div className="relative p-8">
            {/* Header */}
            <div className="text-center mb-8">
              <div
                className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center animate-pulse-glow"
                style={{ background: `linear-gradient(135deg, #7c6aff, #38bdf8)` }}
              >
                <Sparkles size={28} color="white" />
              </div>
              <h1 className="text-2xl font-bold text-foreground mb-1">
                {isLogin ? `欢迎回来` : `加入 Luminary`}
              </h1>
              <p className="text-sm" style={{ color: `rgba(232,234,246,0.5)` }}>
                {isLogin ? `登录您的创作空间` : `开启您的写作之旅`}
              </p>
            </div>

            {/* Social login */}
            <div className="flex gap-3 mb-6">
              <button className="btn-ghost-glass flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-medium text-foreground">
                <Github size={18} />
                GitHub
              </button>
              <button className="btn-ghost-glass flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-medium text-foreground">
                <Twitter size={18} style={{ color: `#38bdf8` }} />
                Twitter
              </button>
            </div>

            <div className="flex items-center gap-3 mb-6">
              <div className="flex-1 divider-glass" />
              <span className="text-xs" style={{ color: `rgba(232,234,246,0.35)` }}>或使用邮箱</span>
              <div className="flex-1 divider-glass" />
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className={isLogin ? `hidden` : ``}>
                <div className="relative">
                  <User
                    size={16}
                    className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ color: `rgba(255,255,255,0.35)` }}
                  />
                  <input
                    type="text"
                    placeholder="用户名"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="glass-input w-full pl-11 pr-4 py-3.5 rounded-2xl text-sm"
                  />
                </div>
              </div>

              <div className="relative">
                <Mail
                  size={16}
                  className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: `rgba(255,255,255,0.35)` }}
                />
                <input
                  type="email"
                  placeholder="邮箱地址"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="glass-input w-full pl-11 pr-4 py-3.5 rounded-2xl text-sm"
                />
              </div>

              <div className="relative">
                <Lock
                  size={16}
                  className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: `rgba(255,255,255,0.35)` }}
                />
                <input
                  type={showPwd ? `text` : `password`}
                  placeholder="密码"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="glass-input w-full pl-11 pr-12 py-3.5 rounded-2xl text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: `rgba(255,255,255,0.35)` }}
                >
                  <div className={showPwd ? `` : `hidden`}>
                    <EyeOff size={16} />
                  </div>
                  <div className={showPwd ? `hidden` : ``}>
                    <Eye size={16} />
                  </div>
                </button>
              </div>

              <div className={isLogin ? `flex justify-end` : `hidden`}>
                <button type="button" className="text-xs" style={{ color: `rgba(124,106,255,0.8)` }}>
                  忘记密码？
                </button>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-primary-glass w-full py-3.5 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 mt-1"
              >
                <div className={loading ? `` : `hidden`}>
                  <div
                    className="w-4 h-4 border-2 rounded-full animate-spin"
                    style={{ borderColor: `rgba(255,255,255,0.3)`, borderTopColor: `white` }}
                  />
                </div>
                <span className={loading ? `hidden` : ``}>
                  {isLogin ? `登录` : `创建账号`}
                </span>
                <span className={loading ? `hidden` : ``}>
                  <ArrowRight size={16} />
                </span>
                <span className={loading ? `` : `hidden`}>处理中...</span>
              </button>
            </form>

            {/* Switch mode */}
            <div className="text-center mt-6">
              <span className="text-sm" style={{ color: `rgba(232,234,246,0.45)` }}>
                {isLogin ? `还没有账号？` : `已有账号？`}
              </span>
              <button
                onClick={() => setIsLogin(!isLogin)}
                className="text-sm font-medium ml-1"
                style={{ color: `#a78bfa` }}
              >
                {isLogin ? `立即注册` : `去登录`}
              </button>
            </div>
          </div>
        </div>

        {/* Footer note */}
        <p className="text-center text-xs mt-4" style={{ color: `rgba(232,234,246,0.25)` }}>
          登录即表示您同意我们的服务条款和隐私政策
        </p>
      </div>
    </div>
  );
};

export default Login;
