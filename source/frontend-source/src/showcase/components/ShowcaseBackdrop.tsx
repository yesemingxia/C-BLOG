/* ShowcaseBackdrop.tsx — 把 showcase 的舞台视觉抽出来，给别的页面当背景
 *
 * 用途：登录页 / 管理后台 / 个人主页要「与展示页同一套风格」，
 * 直接把 Showcase 搬过去是不行的 —— 它带状态机、四个场景轨道、入场层、
 * 顶栏，还会 `body.ssp-active` 锁滚动。这里只取**背景层**：
 *
 *   程序化渐变兜底 + 背景视频 + 暗角 + 噪点（+ 可选水波纹）
 *
 * 三条从 showcase 继承的硬约束（违反会坏，不是"少点样式"）：
 *   1. 根元素 `.ssp-scope` 上**永远不要** transform / filter / perspective /
 *      contain / will-change / backdrop-filter —— 会让内部的 fixed 全部错位。
 *   2. 使用它的页面**不能被 PageTransition 包**（`App.tsx` 的路由层）——
 *      它的 motion.div 带 translateY + blur，同样创建 containing block。
 *   3. 本组件自带 z-index 0，页面内容要自己抬到 10 以上。
 *
 * 视频是可选的：`CONFIG.mediaMode === 'procedural'` 时不渲染 `<video>`，
 * 只留 CSS 渐变（与 `IntroOverlay` 的处理一致）。场景 1 是暗的水下镜头，
 * 压暗后托文字最稳，默认就用它。
 */

import { useEffect, useRef, useState } from "react";
/* 本组件直接复用 showcase 的舞台类（.video-stage / .bg-source / .cinema-vignette /
   .grain），所以 showcase.css 是**必需**的，不是可选装饰。 */
import "../../styles/showcase.css";
import "../../styles/showcase-backdrop.css";
import { CONFIG } from "../config";
import WaterRipple from "../effects/WaterRipple";

export type BackdropSource = "scene1" | "scene2" | "scene3";

interface ShowcaseBackdropProps {
  /** 用哪个场景的背景源。暗色水下镜头（scene1）默认，托文字最稳 */
  source?: BackdropSource;
  /** 额外压暗：0 = 不压，1 = 接近全黑。内容密集的页面（Admin 表格）建议 0.4~0.55 */
  dim?: number;
  /** 鼠标水波纹。长页面滚动时它每帧都在画，只在交互简单的页面开 */
  ripple?: boolean;
  /** 附加类名（挂额外定位/层级用） */
  className?: string;
}

const VIDEO_SRC: Record<BackdropSource, string> = {
  scene1: "/showcase/assets/scene1.mp4",
  scene2: "/showcase/assets/scene2.mp4",
  scene3: "/showcase/assets/scene3.mp4",
};

const ShowcaseBackdrop = ({
  source = "scene1",
  dim = 0.35,
  ripple = false,
  className = "",
}: ShowcaseBackdropProps) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoOk, setVideoOk] = useState(false);
  const showVideo = CONFIG.mediaMode !== "procedural";

  /* 静音自动播放。失败（文件缺失 / 浏览器策略）就退回 CSS 渐变，不报错。 */
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const p = v.play();
    if (p && p.catch) p.catch(() => {});
  }, [showVideo, source]);

  return (
    <div
      className={"ssp-scope ssp-backdrop" + (ripple ? " is-interactive" : "") + (className ? " " + className : "")}
      aria-hidden="true"
    >
      <div className="video-stage">
        <div className={"bg-source bg-" + source.toLowerCase() + " is-visible is-running"} data-source={source}>
          {showVideo && (
            <video
              ref={videoRef}
              className={"bg-video" + (videoOk ? " is-visible" : "")}
              src={VIDEO_SRC[source]}
              muted
              playsInline
              autoPlay
              loop
              preload="auto"
              onCanPlay={() => setVideoOk(true)}
              onError={() => setVideoOk(false)}
            />
          )}
        </div>
        <div className="cinema-vignette" />
        <div className="grain" />
        {ripple && <WaterRipple dataPhase="scene1" />}
      </div>
      {/* 内容可读性靠这一层：视频画面本身有明暗变化，文字直接压上去会时清时糊 */}
      <div className="ssp-backdrop-dim" style={{ background: `rgba(6, 8, 12, ${dim})` }} />
    </div>
  );
};

export default ShowcaseBackdrop;
