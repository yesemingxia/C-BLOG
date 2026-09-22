/* SceneHome.tsx — 场景 1：首页
 *
 * 迁移自 `person/index.html:61-82`。
 *
 * ⚠️ persona 文案**直接 JSX 渲染**，不要用原版 `applyPersona()` 那套
 * `document.getElementById(id).textContent = value`：
 * 那种写法要求 id 必须挂在最内层纯文本元素上，挂到含图标/圆点的父节点会把子元素一起抹掉
 * （person 的 PROJECT_SPEC §9 第 10 条专门警告过）。React 里这个问题自然消失。
 * 保留 id 只是为了和样式表对齐（如 `#home-title` 有自己的定位规则）。
 */

import { CONFIG } from "../config";

interface SceneHomeProps {
  /** 「向下滚动进入」→ 触发 1→2 转场 */
  onEnter: () => void;
}

const SceneHome = ({ onEnter }: SceneHomeProps) => {
  const p = CONFIG.persona;

  return (
    <section className="page page-home" aria-labelledby="home-title">
      <div className="hero-copy">
        <h1 id="home-title">
          <span className="home-title-line">欢迎来到，</span>
          <span className="home-title-line home-title-line-offset">
            <span id="heroNick">{p.nickname}</span> 的主页.
          </span>
        </h1>

        <div className="hero-actions">
          <button id="enterBtn" className="primary-btn" type="button" onClick={onEnter}>
            向下滚动进入
          </button>
          <span className="hint">Scroll Down</span>
        </div>
      </div>

      <aside className="profile-card glass-panel">
        <span className="small-label">Profile</span>
        <h2 id="profileName">{p.nickname}</h2>
        <p id="profileTagline">{p.tagline}</p>
        <dl>
          <div>
            <dt>Location</dt>
            <dd id="profileLocation">{p.location}</dd>
          </div>
          <div>
            <dt>Focus</dt>
            <dd id="profileFocus">{p.focus}</dd>
          </div>
        </dl>
      </aside>
    </section>
  );
};

export default SceneHome;
