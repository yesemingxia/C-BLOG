import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, Mail, Lock, User, Sparkles, ArrowRight, Github, Twitter, ChevronLeft } from "lucide-react";
import GlassBackground from "../components/GlassBackground";
import { useAuth } from "../components/AuthProvider";
import { toast } from "sonner";

const Login = () => {
  const navigate = useNavigate();
  const { login: authLogin, register: authRegister } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [showPwd, setShowPwd] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isLogin) {
        const res = await authLogin(email, password);
        if (res.success) {
          toast.success("登录成功！");
          navigate("/");
        } else {
          toast.error(res.message || "登录失败");
        }
      } else {
        const res = await authRegister(username, email, password);
        if (res.success) {
          toast.success("注册成功！");
          navigate("/");
        } else {
          toast.error(res.message || "注册失败");
        }
      }
    } catch {
      toast.error("请求失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden bg-background">
      <GlassBackground showParticles={true} />

      <button
        onClick={() => navigate("/")}
        className="absolute top-8 left-8 flex items-center gap-2 text-sm font-bold text-foreground/40 hover:text-foreground transition-colors group z-20"
      >
        <ChevronLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
        返回首页
      </button>

      <div className="w-full max-w-[440px] z-10 animate-in fade-in zoom-in-95 duration-700">
        <div className="bento-card p-8 md:p-10 relative overflow-hidden shadow-2xl">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-1 bg-gradient-to-r from-[var(--neon-purple)] to-[var(--neon-blue)] rounded-full blur-md opacity-50" />

          <div className="text-center mb-10">
            <div className="w-16 h-16 rounded-2xl mx-auto mb-6 bg-linear-to-br from-[var(--neon-purple)] to-[var(--neon-blue)] flex items-center justify-center shadow-lg shadow-purple-500/20 animate-pulse-glow">
              <Sparkles size={32} className="text-white fill-white/20" />
            </div>
            <h1 className="text-3xl font-black tracking-tight mb-2" style={{ fontFamily: "var(--font-display)" }}>
              {isLogin ? "Welcome Back" : "Join Nova.dev"}
            </h1>
            <p className="text-sm text-foreground/40 font-medium">
              {isLogin ? "Continue your creative journey" : "Start your digital writing adventure"}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-8">
            <button onClick={() => toast.info("GitHub 登录功能即将上线")} className="btn-ghost-glass flex items-center justify-center gap-3 py-3 rounded-2xl text-sm font-bold">
              <Github size={18} /> GitHub
            </button>
            <button onClick={() => toast.info("Twitter 登录功能即将上线")} className="btn-ghost-glass flex items-center justify-center gap-3 py-3 rounded-2xl text-sm font-bold">
              <Twitter size={18} className="text-sky-400 fill-sky-400/10" /> Twitter
            </button>
          </div>

          <div className="flex items-center gap-4 mb-8">
            <div className="h-px flex-1 bg-white/5" />
            <span className="text-[10px] font-black uppercase tracking-widest text-foreground/20">or use email</span>
            <div className="h-px flex-1 bg-white/5" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div className="space-y-1.5 animate-in slide-in-from-top-2 duration-300">
                <label htmlFor="reg-username" className="text-xs font-bold text-foreground/40 ml-1">Username</label>
                <div className="relative group">
                  <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-foreground/20 group-focus-within:text-[var(--neon-purple)] transition-colors" />
                  <input id="reg-username" type="text" placeholder="Your nickname" value={username} onChange={(e) => setUsername(e.target.value)} className="glass-input w-full pl-12 pr-4 py-3.5 rounded-2xl text-sm font-medium" required={!isLogin} />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="login-email" className="text-xs font-bold text-foreground/40 ml-1">Email</label>
              <div className="relative group">
                <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-foreground/20 group-focus-within:text-[var(--neon-purple)] transition-colors" />
                <input id="login-email" type="email" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className="glass-input w-full pl-12 pr-4 py-3.5 rounded-2xl text-sm font-medium" required />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between items-center ml-1">
                <label htmlFor="login-pwd" className="text-xs font-bold text-foreground/40">Password</label>
                {isLogin && <button type="button" className="text-[10px] font-black uppercase text-[var(--neon-purple)] hover:underline">Forgot password?</button>}
              </div>
              <div className="relative group">
                <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-foreground/20 group-focus-within:text-[var(--neon-purple)] transition-colors" />
                <input id="login-pwd" type={showPwd ? "text" : "password"} placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className="glass-input w-full pl-12 pr-12 py-3.5 rounded-2xl text-sm font-medium" required />
                <button type="button" onClick={() => setShowPwd(!showPwd)} className="absolute right-4 top-1/2 -translate-y-1/2 text-foreground/20 hover:text-foreground transition-colors">
                  {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn-primary-glass w-full py-4 rounded-2xl text-sm font-black text-white flex items-center justify-center gap-3 mt-4 disabled:opacity-50">
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  {isLogin ? "Sign In" : "Create Account"}
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>

          <div className="text-center mt-8 pt-6 border-t border-white/5">
            <p className="text-sm text-foreground/40 font-medium">
              {isLogin ? "Don't have an account?" : "Already have an account?"}
              <button onClick={() => setIsLogin(!isLogin)} className="ml-2 text-[var(--neon-purple)] font-black hover:underline">
                {isLogin ? "Sign Up" : "Sign In"}
              </button>
            </p>
          </div>
        </div>

        <p className="text-center text-[10px] text-foreground/20 font-bold uppercase tracking-widest mt-8">
          By signing in you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </div>
  );
};

export default Login;
