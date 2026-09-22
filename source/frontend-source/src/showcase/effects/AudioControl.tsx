/* AudioControl.tsx — 音频控制面板（播放 / 暂停 / 音量）
 *
 * 迁移自 `person/audio-control.js`（`AudioController` 类，188 行）。
 * DOM 从 `createElement` 改 JSX，状态从实例字段改 React state，其余照抄。
 *
 * ⚠️ 四个不能改的细节（对照表 L 组）：
 *
 * 1. **垂直对齐导航点**（L-04）：读 `.topbar nav` 的 `getBoundingClientRect` 算 top/right。
 *    所以 `nav` 必须是 `.topbar` 的后代 —— `Topbar.tsx` 已保证，别把导航移出去。
 * 2. **音频不可用时整块隐藏**（L-06）：不留「点了没反应」的按钮。
 * 3. **默认音量 0.5**（L-05），来自 `CONFIG.audio.defaultVolume`。
 * 4. **播放中加 `is-playing` 类**（L-07），按钮变青色高亮（样式在 showcase.css）。
 *
 * 面板是 `position: fixed`（z-index 40），所以必须渲染在 `.content-track` **外面**，
 * 并随入场层一起被遮住（入场层 z-index 100 > 40）—— 原版由 effects-init 指定挂载点为
 * `.site-shell`，这里就是在 Showcase 的 `<main class="site-shell">` 内渲染。
 *
 * 原版刻意修过、迁移时必须保留的三处（见 audio-control.js 头部注释）：
 *   1. 播放按钮不再被 `display:none` 藏起来（藏了就没法暂停）
 *   2. 音频缺失时整块面板自动隐藏
 *   3. 挂载点由编排层指定，不写死 body
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { CONFIG } from "../config";
import type { SpectrumApi } from "./AudioSpectrum";

/** 供入场起播（A-05）调用的对外接口 */
export interface AudioControlApi {
  play(): Promise<void>;
  pause(): void;
}

interface AudioControlProps {
  /** 频谱实例；为 null 时面板不可用（原版 `if (!this.spectrumEffect) return`） */
  spectrum: SpectrumApi | null;
  /** 面板实例就绪 / 销毁时通知父层，供「进入网站」按钮起播 */
  onReady?: (api: AudioControlApi | null) => void;
}

const AudioControl = ({ spectrum, onReady }: AudioControlProps) => {
  const panelRef = useRef<HTMLDivElement | null>(null);
  /** ⚠️ 初始为 false，等频谱实例就绪**且** Web Audio 可用后才置 true。
   *  原版是初始 true、面板先渲染、拿到 `error` 再隐藏 —— 这里反过来，
   *  避免无音源时面板闪一下。终态与原版一致（不可用 = 不出现）。 */
  const [available, setAvailable] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(CONFIG.audio.defaultVolume);

  /* 播放（原版 play()：失败只 warn，不改可用性 —— 自动播放策略被拦是正常的） */
  const play = useCallback((): Promise<void> => {
    if (!spectrum) return Promise.resolve();
    return spectrum
      .play()
      .then(() => setIsPlaying(true))
      .catch((err: Error) => {
        console.warn("[audio] 播放失败（浏览器自动播放策略？）：", err?.message);
        setIsPlaying(false);
      });
  }, [spectrum]);

  const pause = useCallback(() => {
    spectrum?.pause();
    setIsPlaying(false);
  }, [spectrum]);

  const toggle = useCallback(() => {
    if (isPlaying) pause();
    else void play();
  }, [isPlaying, pause, play]);

  /* ---------------- 加载音源 ---------------- */
  useEffect(() => {
    if (!spectrum) {
      setAvailable(false);
      return;
    }
    // Web Audio 不可用 → 整块隐藏（原版 loadAudio 的第一道判断）
    if (!spectrum.isAvailable()) {
      setAvailable(false);
      return;
    }
    const url = CONFIG.audio.src;
    if (!url) {
      setAvailable(false);
      return;
    }

    // 三道检查都过了才让面板出现（等价于原版「音频不可用时整块隐藏」的终态）
    setAvailable(true);

    const el = spectrum.loadAudio(url);
    const onError = () => {
      console.warn("[audio] 音频文件不可用：" + url);
      setAvailable(false);
    };
    el.addEventListener("error", onError);

    spectrum.setVolume(CONFIG.audio.defaultVolume);

    return () => {
      el.removeEventListener("error", onError);
    };
  }, [spectrum]);

  /* ---------------- 音量 ---------------- */
  useEffect(() => {
    spectrum?.setVolume(volume);
  }, [spectrum, volume]);

  /* ---------------- 对齐导航点 + resize / 横竖屏重算 ---------------- */
  const alignToNav = useCallback(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const nav = document.querySelector(".topbar nav");
    if (!nav) return;
    const navRect = nav.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const top = navRect.top + (navRect.height - panelRect.height) / 2;
    panel.style.top = Math.max(8, top) + "px";
    const right = window.innerWidth - navRect.left + 16;
    panel.style.right =
      Math.max(8, Math.min(right, window.innerWidth - panelRect.width - 8)) + "px";
  }, []);

  useEffect(() => {
    if (!available) return;
    // 先等一帧让面板拿到真实尺寸，再对齐（原版 setupNavAlignment 的 rAF）
    const id = requestAnimationFrame(alignToNav);
    window.addEventListener("resize", alignToNav);
    window.addEventListener("orientationchange", alignToNav);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("resize", alignToNav);
      window.removeEventListener("orientationchange", alignToNav);
    };
  }, [available, alignToNav]);

  /* ---------------- 暴露给入场起播 ---------------- */
  useEffect(() => {
    onReady?.({ play, pause });
    return () => onReady?.(null);
  }, [onReady, play, pause]);

  /* L-06：音频不可用时整块不渲染 */
  if (!available) return null;

  return (
    <div
      ref={panelRef}
      className={"audio-control-panel" + (isPlaying ? " is-playing" : "")}
      role="region"
      aria-label="音频控制"
    >
      <button
        className="audio-play-btn"
        type="button"
        aria-label={isPlaying ? "暂停音频" : "播放音频"}
        onClick={toggle}
      >
        {/* 两个 svg 靠 is-playing 判定显隐（原版用 style.display 切换） */}
        <svg
          className="icon-play"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
          style={isPlaying ? { display: "none" } : undefined}
        >
          <polygon points="6 3 20 12 6 21 6 3" />
        </svg>
        <svg
          className="icon-pause"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          style={isPlaying ? undefined : { display: "none" }}
        >
          <rect x="6" y="4" width="4" height="16" />
          <rect x="14" y="4" width="4" height="16" />
        </svg>
      </button>

      <div className="audio-volume-container">
        <span className="audio-volume-icon">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          >
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          </svg>
        </span>
        <input
          className="audio-volume-slider"
          type="range"
          min={0}
          max={100}
          value={Math.round(volume * 100)}
          aria-label="音量"
          onChange={(e) => setVolume(parseInt(e.target.value, 10) / 100)}
        />
      </div>
    </div>
  );
};

export default AudioControl;
