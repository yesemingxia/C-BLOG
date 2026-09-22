/* IntroOverlay.tsx — 场景 0：入场层
 *
 * 迁移自 index.html:13-20 与 script.js:458-479。
 *
 * ⚠️ 「进入网站」按钮是背景音乐起播的**唯一合法入口** —— 浏览器自动播放策略
 * 要求播放必须发生在用户手势里。不要"顺手优化"成 useEffect 里自动 play，
 * 那样只会静默失败，且换不来任何体验提升。
 *
 * 阶段 2 范围：结构 + 淡出时序。
 * 阶段 4 补：背景视频（scene1.mp4 的模糊放大版）与氛围层微调。
 * 阶段 5 补：按钮回调里起播背景音乐。
 */

import { useEffect, useRef, useState } from "react";
import { CONFIG } from "../config";

interface IntroOverlayProps {
  /** false 表示已点过「进入网站」，开始淡出 */
  active: boolean;
  onEnter: () => void;
  /** 跳过展示：直接进站并跳到文章列表（场景 2）。同样是站内导航，不跳路由 */
  onSkip?: () => void;
}

const IntroOverlay = ({ active, onEnter, onSkip }: IntroOverlayProps) => {
  const [leaving, setLeaving] = useState(false);
  // @cuiruoni+挂载时就处于非 active（本会话已进站，见 useSceneMachine）→ 直接不渲染，
  // 否则会出现 900ms 的空淡出闪屏
  const [hidden, setHidden] = useState(!active);
  const [videoFailed, setVideoFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  /* 视频文件**还没搬进 public**（71MB，见迁移计划 §6 的决策），
     所以 mediaMode 为 'procedural' 时不渲染 video 元素 ——
     否则每次进入都会是一个必然 404 的请求。改 mediaMode 即可启用。 */
  const showVideo = CONFIG.mediaMode !== "procedural" && !videoFailed;

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    // 静音自动播放；失败不阻断入场（原版也是 catch 掉）
    const p = v.play();
    if (p && p.catch) p.catch(() => {});
  }, [showVideo]);

  /* 入场结束就暂停背景视频（原版 enterSite 里做的） */
  useEffect(() => {
    if (active) return;
    videoRef.current?.pause();
  }, [active]);

  useEffect(() => {
    if (active) return;
    setLeaving(true);
    // CSS 淡出是 860ms，这里 900ms 兜底后卸载（与原版一致的双保险）
    const id = setTimeout(() => setHidden(true), 900);
    return () => clearTimeout(id);
  }, [active]);

  if (hidden) return null;

  return (
    <div
      className={"intro-overlay" + (leaving ? " is-leaving" : "")}
      aria-label="进入网站"
      aria-hidden={leaving ? "true" : undefined}
    >
      {/* 背景视频：scene1.mp4 的模糊放大版（index.html:14 + styles.css:53） */}
      {showVideo && (
        <video
          id="introVideo"
          ref={videoRef}
          className="intro-bg-video"
          src="/showcase/assets/scene1.mp4"
          muted
          playsInline
          autoPlay
          loop
          preload="auto"
          aria-hidden="true"
          onError={() => setVideoFailed(true)}
        />
      )}
      {/* 氛围层：多层径向/线性渐变（index.html:15） */}
      <div className="intro-atmosphere" aria-hidden="true" />
      <button className="intro-enter-btn" type="button" aria-label="进入网站" onClick={onEnter}>
        <span className="intro-enter-cn">进入网站</span>
        <span className="intro-enter-en">ENTER SITE</span>
      </button>
      {/* 入口改为**站内**跳到场景 2（文章列表）—— 博客内容就在这个页面里，
          不再跳 /home。底部居中，样式见 showcase-entry.css；
          absolute 定位是有意的 —— 不碰「进入网站」按钮的原版 grid 居中布局。 */}
      {onSkip && (
        <button type="button" className="intro-blog-link" onClick={onSkip}>
          跳过展示，直接看文章 →
        </button>
      )}
    </div>
  );
};

export default IntroOverlay;
