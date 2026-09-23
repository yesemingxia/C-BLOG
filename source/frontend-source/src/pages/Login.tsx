import { useState } from "react";
import { useNavigate, useMatch, useLocation } from "react-router-dom";
import { Eye, EyeOff, Mail, Lock, User, ArrowRight, ChevronLeft } from "lucide-react";
import "../styles/showcase-auth.css";
import ShowcaseBackdrop from "../showcase/components/ShowcaseBackdrop";
import { useAuth } from "../components/auth/AuthProvider";
import { toast } from "sonner";

/* Login.tsx — 登录 / 注册（同一套表单，isLogin 切换）
 *
 * 2026-09-21 换肤：背景换成 showcase 的舞台（ShowcaseBackdrop），卡片改用
 * showcase 的暗色玻璃语言，与展示页同一套风格。原来的 GlassBackground +
 * bento-card 是博客那套浅色皮肤，两套皮肤来回跳变太割裂 —— 用户拍板统一到展示页这边。
 *
 * ⚠️ 两条不能违反的约束（都是 fixed 布局的坑）：
 *   1. 页面根元素 `.ssp-scope.ssp-auth` **不能有** transform / filter ——
 *      内层 backdrop 的 .video-stage / .cinema-vignette / .grain 全是 fixed，
 *      祖先一旦创建 containing block 它们就会整块错位。
 *   2. 因此 `App.tsx` 里 /login 与 /register **不能包 PageTransition**
 *      （它的 motion.div 带 translateY + blur，正是上面那条）。
 *
 * 逻辑没动：登录/注册、显示密码、错误提示都与原来一致。
 * 唯一的行为变化是成功后的落点 —— 由 `/home` 改成 `/`（展示页），
 * 因为改造后展示页就是博客本身，不再是「门面 + 跳转」。
 */

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isRegisterRoute = useMatch("/register");
  const { login: authLogin, register: authRegister } = useAuth();
  const [isLogin, setIsLogin] = useState(!isRegisterRoute);
  const [showPwd, setShowPwd] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);

  /* 从文章弹窗「登录后即可发表评论」跳来的（见 PostModal.requireLogin）：
     state 里带着要重开的文章 id，登录/注册成功后原样传回 /showcase，
     由 Showcase 自动重开那篇文章的弹窗 —— 而不是落回首页。 */
  const reopenPostId = (location.state as { reopenPost?: number } | null)?.reopenPost;

  /* 左上角返回：从文章弹窗跳来的用户可能根本不想登录、只想接着读文章 ——
     返回要把文章弹窗原样带回（Showcase 读到 reopenPost 重开）；其他来源
     有历史就退回上一页，没有（直接输网址进来）才落回首页。 */
  const handleBack = () => {
    if (reopenPostId) {
      navigate("/showcase", { state: { reopenPost: reopenPostId } });
    } else if (((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0) {
      navigate(-1);
    } else {
      navigate("/");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isLogin) {
        const res = await authLogin(email, password);
        if (res.success) {
          toast.success("登录成功！");
          if (reopenPostId) navigate("/showcase", { state: { reopenPost: reopenPostId } });
          else navigate("/");
        } else {
          toast.error(res.message || "登录失败");
        }
      } else {
        const res = await authRegister(username, email, password);
        if (res.success) {
          toast.success("注册成功！");
          if (reopenPostId) navigate("/showcase", { state: { reopenPost: reopenPostId } });
          else navigate("/");
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
    <div className="ssp-scope ssp-auth">
      {/* 背景：与展示页同一套舞台（视频 / 渐变兜底 + 暗角 + 噪点）。
          dim 0.4 是给表单一个稳定的底 —— 视频画面明暗会变，压一层才好读。 */}
      <ShowcaseBackdrop dim={0.4} />

      <button type="button" className="auth-back" onClick={handleBack}>
        <ChevronLeft size={16} />
        {reopenPostId ? "返回文章" : "返回首页"}
      </button>

      <div className="auth-shell">
        <div className="auth-card">
          <div className="auth-badge">
            {/* @cuiruoni+用户指定图标：用上传的图（与站点 favicon 同一张） */}
            <img src="/favicon.png" alt="Blog" className="auth-badge-img" />
          </div>
          <h1 className="auth-title">{isLogin ? "Welcome Back" : "Join Blog"}</h1>
          <p className="auth-sub">
            {isLogin ? "登录后即可写文章、管理你的内容" : "创建一个账号，开始写下第一篇"}
          </p>

          <form onSubmit={handleSubmit}>
            {!isLogin && (
              <div className="auth-field">
                <label className="auth-label" htmlFor="reg-username">用户名</label>
                <div className="auth-input-wrap">
                  <span className="auth-input-icon">
                    <User size={16} />
                  </span>
                  <input
                    id="reg-username"
                    type="text"
                    className="auth-input"
                    placeholder="你的昵称"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required={!isLogin}
                  />
                </div>
              </div>
            )}

            <div className="auth-field">
              <label className="auth-label" htmlFor="login-email">用户名或邮箱</label>
              <div className="auth-input-wrap">
                <span className="auth-input-icon">
                  <Mail size={16} />
                </span>
                <input
                  id="login-email"
                  type="text"
                  className="auth-input"
                  placeholder="username 或 name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="login-pwd">密码</label>
              <div className="auth-input-wrap">
                <span className="auth-input-icon">
                  <Lock size={16} />
                </span>
                <input
                  id="login-pwd"
                  type={showPwd ? "text" : "password"}
                  className="auth-input"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="auth-eye"
                  aria-label={showPwd ? "隐藏密码" : "显示密码"}
                  onClick={() => setShowPwd(!showPwd)}
                >
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button type="submit" className="auth-submit" disabled={loading}>
              {loading ? (
                <>
                  <span className="auth-spin" />
                  处理中…
                </>
              ) : (
                <>
                  {isLogin ? "登录" : "创建账号"}
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          <p className="auth-switch">
            {isLogin ? "还没有账号？" : "已经有账号了？"}
            <button type="button" className="auth-switch-btn" onClick={() => setIsLogin(!isLogin)}>
              {isLogin ? "去注册" : "去登录"}
            </button>
          </p>
        </div>

        <p className="auth-foot">
          {isLogin ? "登录即表示同意服务条款与隐私政策" : "注册即表示同意服务条款与隐私政策"}
        </p>
      </div>
    </div>
  );
};

export default Login;
