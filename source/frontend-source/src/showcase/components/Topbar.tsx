/* Topbar.tsx — person 自己的顶栏（brand + 4 个导航点）
 *
 * 迁移自 index.html:39-55 与 script.js:482-491。
 *
 * ⚠️ `nav` 必须是 `.topbar` 的后代 —— 音频控制面板靠
 * `.topbar nav` 的 getBoundingClientRect 做垂直对齐（BackgroundSource 那一侧的
 * audio-control.js:89）。把导航移出 topbar，面板位置会飘。
 */

import { useNavigate } from "react-router-dom";
import { useAuth } from "../../components/auth/AuthProvider";
import { CONFIG } from "../config";

interface TopbarProps {
  /** 当前场景号 1..4，用于点亮对应的 nav-dot */
  scene: number;
  onGoScene: (n: 1 | 2 | 3 | 4) => void;
}

const NAV_ITEMS = [
  { go: 1, label: "首页" },
  { go: 2, label: "作品页" },
  { go: 3, label: "相册页" },
  { go: 4, label: "联系页" },
] as const;

const Topbar = ({ scene, onGoScene }: TopbarProps) => {
  const navigate = useNavigate();
  // @cuiruoni+管理员才显示「管理」入口（/admin 后台：仪表盘/用户/文章/评论）
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  return (
    <header className="topbar">
      {/* 原版的 brand 是个裸 <a href="#">，没有绑事件，这里保持一致 */}
      <a className="brand" href="#" aria-label="回到首页">
        <span className="brand-mark" />
        <span id="brandText">{CONFIG.persona.brand}</span>
      </a>
      {/* @cuiruoni+wrapper 把导航点与博客入口靠右成组；
          nav 仍是 .topbar 后代，音频面板的 getBoundingClientRect 对齐不受影响 */}
      <div className="topbar-right">
        <nav aria-label="场景导航">
          {NAV_ITEMS.map((d) => (
            <button
              key={d.go}
              className={"nav-dot" + (scene === d.go ? " is-active" : "")}
              data-go={`scene${d.go}`}
              type="button"
              aria-label={d.label}
              onClick={() => onGoScene(d.go)}
            />
          ))}
        </nav>
        {/* 入口改为**站内**跳到场景 2（文章列表）—— 用户明确不要"跳转到博客"，
            博客内容现在就在这个页面里。样式见 showcase-entry.css。 */}
        <button type="button" className="topbar-blog-link" onClick={() => onGoScene(2)}>
          文章
        </button>
        {/* @cuiruoni+登录用户显示「我的」入口（/profile 个人管理中心） */}
        {user && (
          <button
            type="button"
            className="topbar-blog-link"
            onClick={() => navigate("/profile")}
          >
            我的
          </button>
        )}
        {isAdmin && (
          <button
            type="button"
            className="topbar-blog-link topbar-admin-link"
            onClick={() => navigate("/admin")}
          >
            管理
          </button>
        )}
      </div>
    </header>
  );
};

export default Topbar;
