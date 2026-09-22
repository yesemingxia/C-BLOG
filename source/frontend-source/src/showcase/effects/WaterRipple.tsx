/* WaterRipple.tsx — 鼠标轨迹水波纹（Canvas）
 *
 * 迁移自 `person/water-ripple.js`（WaterRippleEffect 类）+ `effects-init.js` 的创建与编排。
 *
 * ⚠️ 三个不能改的细节：
 *
 * 1. **`#fxCanvas` 必须留在 `#videoStage` 内**。波纹监听的是
 *    `canvas.parentElement` 的 pointermove/touchmove（不是 canvas 自己，因为它
 *    `pointer-events: none`）。把它移出舞台 → 鼠标轨迹不再产生波纹。
 *
 * 2. **全站只有一个实例**。原版早期是「类里自初始化 + effects-init 再建一个」，
 *    两层叠加导致双重 rAF，后来才收敛成单实例。这里由组件保证只有一份。
 *
 * 3. **`prefers-reduced-motion: reduce` 时不创建**（原版在 effects-init 的 JS 侧判断，
 *    不是靠 CSS 屏蔽）。
 *
 * 顺手修掉的原版缺陷：原版的 `touchmove` 用**匿名函数**注册，`destroy()` 移不掉 ——
 * 每次重建都会多留一个监听器。这里用命名引用，能真正移除。
 */

import { useEffect, useRef } from "react";
import { CONFIG, type RippleConfig } from "../config";
import { opacityFor } from "./phaseOpacity";

/** 水波纹在各 phase 下的不透明度来自共享表 `phaseOpacity.ts`
 *  （原版就集中定义在 `effects-init.js:72-78`，同时管水波纹与频谱，
 *  所以抽成一份，避免两个组件各存一张表、改一处忘一处）。 */

interface RipplePoint {
  x: number;
  y: number;
  radius: number;
  alpha: number;
  /** 存活帧数，首次出现时为 undefined（原版如此，用 (age || 0) 兜底） */
  age?: number;
}

/** 波纹点坐标的来源：pointermove 事件 或 touchmove 里的 Touch 对象 */
interface PointLike {
  clientX: number;
  clientY: number;
}

class WaterRippleEffect {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private ripples: RipplePoint[] = [];
  private last = 0;
  private dpr: number;
  private running = false;
  private w = 0;
  private h = 0;
  private R: RippleConfig;
  private target: HTMLElement | null;

  /* 命名引用 —— destroy 时才能移除（原版 touchmove 用匿名函数，移不掉） */
  private readonly onResize: () => void;
  private readonly onPointerMove: (e: PointerEvent) => void;
  private readonly onTouchMove: (e: TouchEvent) => void;

  constructor(canvas: HTMLCanvasElement, rippleConfig: RippleConfig) {
    this.canvas = canvas;
    this.R = rippleConfig;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("[ripple] 拿不到 2d context");
    this.ctx = ctx;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.target = canvas.parentElement;

    this.onResize = () => this.resize();
    this.onPointerMove = (e) => this.spawn(e);
    this.onTouchMove = (e) => {
      if (e.touches && e.touches[0]) this.spawn(e.touches[0]);
    };

    this.resize();
    window.addEventListener("resize", this.onResize);
    if (this.target) {
      this.target.addEventListener("pointermove", this.onPointerMove, { passive: true });
      this.target.addEventListener("touchmove", this.onTouchMove, { passive: true });
    }
  }

  private resize(): void {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const r = parent.getBoundingClientRect();
    this.w = r.width;
    this.h = r.height;
    this.canvas.width = Math.floor(this.w * this.dpr);
    this.canvas.height = Math.floor(this.h * this.dpr);
    this.canvas.style.width = this.w + "px";
    this.canvas.style.height = this.h + "px";
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  private spawn(e: PointLike): void {
    const now = performance.now();
    if (now - this.last < this.R.throttle) return;
    this.last = now;

    const r = this.canvas.getBoundingClientRect();
    this.ripples.push({
      x: e.clientX - r.left,
      y: e.clientY - r.top,
      radius: 0,
      alpha: this.R.alpha,
    });
    if (!this.running) {
      this.running = true;
      requestAnimationFrame(this.loop);
    }
  }

  private readonly loop = (): void => {
    const ctx = this.ctx;
    const R = this.R;
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.globalCompositeOperation = "screen";

    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const p = this.ripples[i];
      p.radius += R.speed * (R.maxRadius / 40);
      p.alpha -= R.decay;

      if (p.alpha <= 0 || p.radius > R.maxRadius || (p.age ?? 0) > R.life) {
        this.ripples.splice(i, 1);
        continue;
      }
      p.age = (p.age ?? 0) + 1;

      // 1) 径向渐变光晕：白 → 青 → 透明
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius);
      g.addColorStop(0, "rgba(255,255,255," + p.alpha * 0.55 + ")");
      g.addColorStop(0.5, "rgba(150,235,255," + p.alpha * 0.3 + ")");
      g.addColorStop(1, "rgba(103,232,249,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();

      // 2) 青色外圈
      ctx.strokeStyle = "rgba(103,232,249," + p.alpha * 0.6 + ")";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.stroke();

      // 3) 白色内圈（半径 ×0.56）
      ctx.strokeStyle = "rgba(255,255,255," + p.alpha * 0.38 + ")";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius * 0.56, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.globalCompositeOperation = "source-over";
    if (this.ripples.length) requestAnimationFrame(this.loop);
    else this.running = false;
  };

  destroy(): void {
    this.ripples.length = 0;
    this.running = false;
    window.removeEventListener("resize", this.onResize);
    if (this.target) {
      this.target.removeEventListener("pointermove", this.onPointerMove);
      this.target.removeEventListener("touchmove", this.onTouchMove);
      this.target = null;
    }
  }
}

interface WaterRippleProps {
  /** 归一化后的 data-phase（scene1 / scene2 / scene3 / scene4 / transition / transition-2-3 …） */
  dataPhase: string;
}

const WaterRipple = ({ dataPhase }: WaterRippleProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const effectRef = useRef<WaterRippleEffect | null>(null);

  useEffect(() => {
    // 减动效偏好：直接不创建（原版在 effects-init.js 的 JS 侧判断）
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const effect = new WaterRippleEffect(canvas, CONFIG.ripple);
    effectRef.current = effect;
    return () => {
      effect.destroy();
      effectRef.current = null;
    };
  }, []);

  /* 透明度跟随 phase。
     原版靠 MutationObserver 监听 body[data-phase]（effects-init.js:61-70），
     这里 dataPhase 是 React state，直接依赖它即可 —— 那个 observer 不需要了。 */
  useEffect(() => {
    const canvas = effectRef.current?.canvas;
    if (!canvas) return;
    canvas.style.opacity = String(opacityFor(dataPhase, "ripple"));
  }, [dataPhase]);

  return <canvas id="fxCanvas" ref={canvasRef} className="fx-canvas" aria-hidden="true" />;
};

export default WaterRipple;
