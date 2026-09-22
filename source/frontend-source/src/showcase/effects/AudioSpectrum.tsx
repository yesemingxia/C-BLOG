/* AudioSpectrum.tsx — Web Audio 频谱可视化（Canvas）
 *
 * 迁移自 `person/audio-spectrum.js`（`AudioSpectrumEffect` 类，289 行）。
 * 类体照抄，只做三件事：IIFE → `export class`、`global.*` → `window.*`、加类型。
 *
 * ⚠️ 五个不能改的细节（对照表 K 组）：
 *
 * 1. **不要设 `crossOrigin`**（K-08）。原版 SPEC 明说：加了反而让本地 `file://` 请求失败。
 * 2. **`canplay` 之后才 connect 音源**（K-07）。提前 connect 会抛，且不能重复 connect
 *    （`connectAudio` 里有 `if (this.audioSource) return true` 幂等守卫，别删）。
 * 3. **`play()` 前若 AudioContext 处于 suspended 要先 `resume()`**（K-09）—— 浏览器自动播放策略。
 * 4. **柱参数在模块加载时求值**（K-03）。`config.ts` 里的 `spectrum.barCount` 等依赖
 *    `window.innerWidth`，resize 后不重算 —— 这是原版行为，不要"顺手修好"。
 * 5. **未播放时画呼吸基线**（K-06）：`idleAmplitude(0.06) × (0.6 + 0.4·sin(t·1.6 + i·0.7))`。
 *    SPEC 没提这条，但代码有 —— 它让面板在暂停时也不像死的。
 *
 * 颜色以**代码为准**（不是对照表的描述）：辉光 `rgba(103,232,249,.35)` 青色、
 * 柱 `rgba(255,255,255,.85)` 白色，两遍 `fillRect`（先辉光后柱，尺寸外扩 1.4/2）。
 *
 * 降级：Web Audio 不可用 / 音源加载失败 → 全部 no-op，不抛错、不画空 canvas。
 */

import { useEffect, useRef, type RefObject } from "react";
import { CONFIG, type SpectrumConfig } from "../config";
import { opacityFor } from "./phaseOpacity";

/** 解析后的完整配置（原版 constructor 里那段默认值 + 显式覆盖的逻辑） */
interface ResolvedSpectrumOptions {
  fftSize: number;
  smoothingTimeConstant: number;
  barCount: number;
  barColor: string;
  barGlowColor: string;
  minHeight: number;
  barSpacing: number;
  maxWidth: number;
  layout: string;
  barWidth: number;
  position: string;
  sensitivity: number;
  opacity: number;
  idleAmplitude: number;
}

function resolveOptions(raw: SpectrumConfig, mobile: boolean): ResolvedSpectrumOptions {
  return {
    fftSize: raw.fftSize || 256,
    smoothingTimeConstant: raw.smoothingTimeConstant || 0.75,
    barCount: raw.barCount || (mobile ? 32 : 64),
    barColor: "rgba(255, 255, 255, 0.85)",
    barGlowColor: "rgba(103, 232, 249, 0.35)",
    minHeight: 2,
    barSpacing: raw.barSpacing || (mobile ? 2 : 4),
    maxWidth: raw.maxWidth || 190,
    layout: raw.layout || "arc",
    barWidth: raw.barWidth || 3,
    position: "compact-center",
    sensitivity: raw.sensitivity || 1.2,
    opacity: raw.opacity || 0.85,
    idleAmplitude: 0.06,
  };
}

export class AudioSpectrumEffect {
  readonly container: HTMLElement;
  canvas: HTMLCanvasElement | null = null;
  audioElement: HTMLAudioElement | null = null;

  private ctx: CanvasRenderingContext2D | null = null;
  private animationId: number | null = null;
  private resizeHandler: (() => void) | null = null;

  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  /** ⚠️ 必须显式写成 `Uint8Array<ArrayBuffer>`：TS 5.7+ 之后
   *  `getByteFrequencyData()` 只接受 `Uint8Array<ArrayBuffer>`，
   *  而裸 `Uint8Array` 会被解析成 `Uint8Array<ArrayBufferLike>`（含 SharedArrayBuffer）→ 编译不过。 */
  private dataArray: Uint8Array<ArrayBuffer> | null = null;
  private audioSource: MediaElementAudioSourceNode | null = null;

  private isPlaying = false;
  private canvasWidth = 0;
  private canvasHeight = 0;
  private readonly o: ResolvedSpectrumOptions;

  constructor(container: HTMLElement, options: SpectrumConfig) {
    this.container = container;
    this.o = resolveOptions(options, window.innerWidth < 768);
    this.init();
  }

  private init(): void {
    this.createCanvas();
    this.setupAudioContext();
    this.setupEventListeners();
    this.startAnimation();
  }

  private createCanvas(): void {
    const o = this.o;
    const c = document.createElement("canvas");
    c.className = "audio-spectrum-canvas";
    c.setAttribute("aria-hidden", "true");

    // 内联样式优先级高于 showcase.css 里的 `.audio-spectrum-canvas` 规则
    // （那条是 `position:absolute; inset:0; width/height:100%`），
    // 所以 compact-center 能覆盖成全宽 60px、水平居中、贴底部。
    c.style.position = "absolute";
    c.style.pointerEvents = "none";
    c.style.zIndex = "4";
    c.style.opacity = String(o.opacity);
    if (o.position === "compact-center") {
      c.style.top = "auto";
      c.style.bottom = "calc(clamp(20px, 4vh, 44px) + 18px)";
      c.style.left = "50%";
      c.style.width = o.maxWidth + "px";
      c.style.height = "60px";
      c.style.transform = "translateX(-50%)";
      c.style.filter = "drop-shadow(0 0 10px rgba(103, 232, 249, 0.18))";
    } else {
      c.style.top = "0";
      c.style.left = "0";
      c.style.width = "100%";
      c.style.height = "100%";
    }

    this.ctx = c.getContext("2d", { alpha: true });
    this.container.appendChild(c);
    this.canvas = c;
    this.resizeCanvas();
  }

  resizeCanvas(): void {
    if (!this.canvas || !this.ctx) return;
    const dpr = window.devicePixelRatio || 1;
    let w: number;
    let h: number;
    if (this.o.position === "compact-center") {
      w = Math.min(this.o.maxWidth, window.innerWidth < 768 ? 120 : this.o.maxWidth);
      h = 60;
    } else {
      const rect = this.container.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
    }
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + "px";
    this.canvas.style.height = h + "px";
    this.canvasWidth = w;
    this.canvasHeight = h;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private setupAudioContext(): void {
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) throw new Error("no AudioContext");
      this.audioContext = new Ctx();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = this.o.fftSize;
      this.analyser.smoothingTimeConstant = this.o.smoothingTimeConstant;
      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    } catch (err) {
      console.warn("[spectrum] Web Audio 不可用：", (err as Error).message);
      this.audioContext = null;
    }
  }

  /** Web Audio 是否可用（不是"音源文件是否存在"） */
  isAvailable(): boolean {
    return !!(this.audioContext && this.analyser);
  }

  /** 幂等：同一个 audio 元素 connect 两次会抛，所以有 audioSource 就直接返回 */
  private connectAudio(source: HTMLAudioElement): boolean {
    if (!this.isAvailable() || !this.audioContext || !this.analyser) return false;
    if (this.audioSource) return true;
    try {
      this.audioSource = this.audioContext.createMediaElementSource(source);
      this.audioSource.connect(this.analyser);
      this.analyser.connect(this.audioContext.destination);
      return true;
    } catch (err) {
      console.warn("[spectrum] 音频源接入失败：", (err as Error).message);
      this.audioSource = null;
      return false;
    }
  }

  /** 创建并返回 <audio>；**不设 crossOrigin**（K-08） */
  loadAudio(url: string): HTMLAudioElement {
    if (!this.audioElement) {
      this.audioElement = new Audio();
      this.audioElement.preload = "auto";
    }
    this.audioElement.src = url;
    this.audioElement.loop = true;
    const el = this.audioElement;
    el.addEventListener(
      "canplay",
      () => {
        this.connectAudio(el);
      },
      { once: true },
    );
    return el;
  }

  play(): Promise<void> {
    const el = this.audioElement;
    if (!el) return Promise.reject(new Error("no audio loaded"));
    const ready =
      this.audioContext && this.audioContext.state === "suspended"
        ? this.audioContext.resume()
        : Promise.resolve();
    return ready
      .then(() => {
        if (!this.audioSource) this.connectAudio(el);
        return el.play();
      })
      .then(() => {
        this.isPlaying = true;
      });
  }

  pause(): void {
    this.isPlaying = false;
    if (this.audioElement) this.audioElement.pause();
  }

  setVolume(v: number): void {
    if (this.audioElement) this.audioElement.volume = Math.max(0, Math.min(1, v));
  }

  private setupEventListeners(): void {
    this.resizeHandler = () => this.resizeCanvas();
    window.addEventListener("resize", this.resizeHandler);
  }

  private getAverageForBar(index: number, samplesPerBar: number): number {
    if (!this.dataArray) return 0;
    let sum = 0;
    const start = index * samplesPerBar;
    const end = Math.min(start + samplesPerBar, this.dataArray.length);
    for (let j = start; j < end; j += 1) sum += this.dataArray[j];
    return sum / Math.max(1, end - start);
  }

  private drawSpectrum(): void {
    if (!this.ctx) return;
    this.ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
    if (!this.isAvailable() || !this.analyser) return;

    if (this.isPlaying) this.analyser.getByteFrequencyData(this.dataArray!);
    else this.dataArray!.fill(0);

    if (this.o.position === "compact-center") this.drawCompactSpectrum();
    else this.drawFullscreenSpectrum();
  }

  /** compact-center：固定宽度、拱形（`sin(progress × π) × 8`）、垂直居中于 60px 画布 */
  private drawCompactSpectrum(): void {
    if (!this.ctx) return;
    const o = this.o;
    const barCount = o.barCount;
    const totalWidth = barCount * o.barWidth + (barCount - 1) * o.barSpacing;
    const startX = (this.canvasWidth - totalWidth) / 2;
    const samplesPerBar = Math.max(1, Math.floor((this.dataArray?.length ?? 0) / barCount));
    const maxBarHeight = this.canvasHeight * 0.42;
    const t = performance.now() / 1000;

    for (let i = 0; i < barCount; i += 1) {
      const avg = this.isPlaying ? this.getAverageForBar(i, samplesPerBar) / 255 : 0;
      let v = Math.min(1, avg * o.sensitivity);
      // 未播放时留一条极低的呼吸基线，避免面板看起来是死的（K-06）
      if (!this.isPlaying) v = o.idleAmplitude * (0.6 + 0.4 * Math.sin(t * 1.6 + i * 0.7));
      const barHeight = Math.max(o.minHeight, v * maxBarHeight);
      const progress = barCount > 1 ? i / (barCount - 1) : 0;
      const arcOffset = o.layout === "arc" ? Math.sin(progress * Math.PI) * 8 : 0;
      const x = startX + i * (o.barWidth + o.barSpacing);
      const centerY = this.canvasHeight / 2 + arcOffset;
      const yTop = centerY - barHeight / 2;

      // 先辉光（青色，外扩 0.7 / 1 / 1.4 / 2），后柱（白色）
      this.ctx.fillStyle = o.barGlowColor;
      this.ctx.fillRect(x - 0.7, yTop - 1, o.barWidth + 1.4, barHeight + 2);
      this.ctx.fillStyle = o.barColor;
      this.ctx.fillRect(x, yTop, o.barWidth, barHeight);
    }
  }

  /** 非 compact 布局（当前配置没用到，但原版有，照搬保留） */
  private drawFullscreenSpectrum(): void {
    if (!this.ctx) return;
    const o = this.o;
    const totalSpacing = o.barSpacing * (o.barCount - 1);
    const barWidth = (this.canvasWidth - totalSpacing) / o.barCount;
    const samplesPerBar = Math.max(1, Math.floor((this.dataArray?.length ?? 0) / o.barCount));

    for (let i = 0; i < o.barCount; i += 1) {
      const avg = this.isPlaying ? this.getAverageForBar(i, samplesPerBar) / 255 : 0;
      const v = Math.min(1, avg * o.sensitivity);
      const barHeight = Math.max(o.minHeight, v * this.canvasHeight * 0.4);
      const x = i * (barWidth + o.barSpacing);
      let y: number;
      if (o.position === "bottom") y = this.canvasHeight - barHeight;
      else if (o.position === "top") y = 0;
      else y = (this.canvasHeight - barHeight) / 2;

      this.ctx.fillStyle = o.barGlowColor;
      this.ctx.fillRect(x - 1, y - 1, barWidth + 2, barHeight + 2);
      this.ctx.fillStyle = o.barColor;
      this.ctx.fillRect(x, y, barWidth, barHeight);
    }
  }

  /** 原版是无条件 rAF 递归 —— 与进度条那个纯空转的循环不同，
   *  这里的每一帧都有视觉输出（播放时画柱、暂停时画呼吸基线），所以保持常驻。 */
  private startAnimation(): void {
    const animate = () => {
      this.drawSpectrum();
      this.animationId = requestAnimationFrame(animate);
    };
    animate();
  }

  setOpacity(v: number): void {
    if (this.canvas) this.canvas.style.opacity = String(v);
  }

  destroy(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    if (this.resizeHandler) {
      window.removeEventListener("resize", this.resizeHandler);
      this.resizeHandler = null;
    }
    this.pause();
    if (this.audioSource) {
      try {
        this.audioSource.disconnect();
      } catch {
        /* 忽略 */
      }
      this.audioSource = null;
    }
    if (this.analyser) {
      try {
        this.analyser.disconnect();
      } catch {
        /* 忽略 */
      }
      this.analyser = null;
    }
    if (this.audioContext && this.audioContext.state !== "closed") {
      try {
        void this.audioContext.close();
      } catch {
        /* 忽略 */
      }
      this.audioContext = null;
    }
    if (this.canvas && this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
    this.canvas = null;
    this.ctx = null;
  }
}

/* ---------------- React 包装 ---------------- */

/** 供 AudioControl / 入场起播使用的对外接口（原版直接操作实例，这里收窄） */
export interface SpectrumApi {
  isAvailable(): boolean;
  loadAudio(url: string): HTMLAudioElement;
  play(): Promise<void>;
  pause(): void;
  setVolume(v: number): void;
  setOpacity(v: number): void;
}

interface AudioSpectrumProps {
  /** `#videoStage` —— canvas 挂到这里（原版 `effects-init.js:38`） */
  stageRef: RefObject<HTMLDivElement | null>;
  /** 归一化后的 data-phase，驱动透明度（原版靠 MutationObserver，这里直接依赖） */
  dataPhase: string;
  /** 实例就绪 / 销毁时通知父层，供 AudioControl 与入场起播取用 */
  onReady?: (api: SpectrumApi | null) => void;
}

const AudioSpectrum = ({ stageRef, dataPhase, onReady }: AudioSpectrumProps) => {
  const effectRef = useRef<AudioSpectrumEffect | null>(null);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const effect = new AudioSpectrumEffect(stage, CONFIG.audio.spectrum);
    effectRef.current = effect;

    const api: SpectrumApi = {
      isAvailable: () => effect.isAvailable(),
      loadAudio: (url) => effect.loadAudio(url),
      play: () => effect.play(),
      pause: () => effect.pause(),
      setVolume: (v) => effect.setVolume(v),
      setOpacity: (v) => effect.setOpacity(v),
    };
    onReady?.(api);

    return () => {
      effect.destroy();
      effectRef.current = null;
      onReady?.(null);
    };
  }, [stageRef, onReady]);

  /* 透明度跟随 phase（原版 effects-init.js 的 applyPhase） */
  useEffect(() => {
    effectRef.current?.setOpacity(opacityFor(dataPhase, "spectrum"));
  }, [dataPhase]);

  // canvas 由类自己创建并 append 到 stage，这里不渲染任何 DOM
  return null;
};

export default AudioSpectrum;
