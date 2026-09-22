/* usePhotoFlow.ts — 场景 3 的照片流
 *
 * 迁移自 `person/gallery-3d.js` 的全部核心逻辑。三类职责：
 *   1. 分列：`index % 2` 决定左右（**没有 column 字段**，写了也不生效）
 *   2. 无限滚动：每列内容复制两份首尾相接，rAF 累加 offset，越界时按轨道高度归一化
 *   3. 悬停：只暂停所在列；卡片做 3D 倾斜 + 跟随鼠标的径向高光
 *
 * ⚠️ 三个不能改的细节：
 *    · 轨道高度**测量优先**（`strip.scrollHeight / 2`），没有数字兜底。
 *      图片加载完 / 窗口 resize 后 150ms 防抖重算，否则接缝会错位。
 *    · 左列向上（dir -1，初始 offset 0），右列向下（dir +1，初始 offset = -轨道高度）。
 *    · `gallery:wheel` 只是滚动手感上的微调（clamp ±12px），**不切换场景**。
 *
 * 3D 倾斜只在 ≥769px 启用；舞台已给 `perspective: 1000px`，
 * 所以这里只写角度与景深，卡片自身**不要**再写 perspective（会叠加，倾斜方向错乱）。
 */

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { bus, EVT } from "./bus";
import { CONFIG } from "../config";
import type { Photo } from "./photos";

type Side = "left" | "right";

export interface PhotoFlowApi {
  getPhotoById(id: number): Photo | null;
  getAllPhotos(): Photo[];
  pause(): void;
  resume(): void;
  start(): void;
  stop(): void;
}

export interface UsePhotoFlowResult {
  leftColRef: RefObject<HTMLDivElement | null>;
  rightColRef: RefObject<HTMLDivElement | null>;
  leftStripRef: RefObject<HTMLDivElement | null>;
  rightStripRef: RefObject<HTMLDivElement | null>;
  /** 初始化完成后才有值；轮播用它 pause / resume */
  api: PhotoFlowApi | null;
  /** 分好列的两组照片，供组件渲染 */
  groups: { left: Photo[]; right: Photo[] };
  /** N <= 1：单列静态，不滚动 */
  single: boolean;
  /** N === 0：显示空态 */
  isEmpty: boolean;
}

export function usePhotoFlow(photos: Photo[]): UsePhotoFlowResult {
  const leftColRef = useRef<HTMLDivElement | null>(null);
  const rightColRef = useRef<HTMLDivElement | null>(null);
  const leftStripRef = useRef<HTMLDivElement | null>(null);
  const rightStripRef = useRef<HTMLDivElement | null>(null);
  const [api, setApi] = useState<PhotoFlowApi | null>(null);

  const groups = useMemo(() => {
    const left: Photo[] = [];
    const right: Photo[] = [];
    photos.forEach((p, i) => (i % 2 === 0 ? left : right).push(p));
    return { left, right };
  }, [photos]);

  const single = photos.length <= 1;
  const isEmpty = photos.length === 0;

  useEffect(() => {
    if (single || isEmpty) {
      // N<=1 时不进循环（原版 init() 有专门分支）
      setApi({
        getPhotoById: (id) => photos.find((p) => p.id === id) ?? null,
        getAllPhotos: () => photos.slice(),
        pause: () => {},
        resume: () => {},
        start: () => {},
        stop: () => {},
      });
      return () => setApi(null);
    }

    const strips: Record<Side, HTMLDivElement | null> = {
      left: leftStripRef.current,
      right: rightStripRef.current,
    };
    if (!strips.left || !strips.right) return;

    const flow = {
      offsets: { left: 0, right: 0 },
      heights: { left: 0, right: 0 },
      paused: { left: false, right: false },
      running: false,
    };
    let rafId: number | null = null;

    /** 轨道高度 = 内容高度的一半（因为复制了两份） */
    const measure = (side: Side) => {
      const s = strips[side];
      if (!s) {
        flow.heights[side] = 0;
        return;
      }
      const h = s.scrollHeight / 2;
      if (h > 0) flow.heights[side] = h;
    };

    const apply = (side: Side) => {
      const s = strips[side];
      if (s) s.style.transform = `translate3d(0,${flow.offsets[side]}px,0)`;
    };

    const tick = () => {
      if (!flow.running) return;
      (["left", "right"] as const).forEach((side) => {
        if (flow.paused[side] || !flow.heights[side]) return;
        const dir = side === "left" ? -1 : 1;
        flow.offsets[side] += dir * CONFIG.photoSpeed;
        if (flow.offsets[side] <= -flow.heights[side]) flow.offsets[side] += flow.heights[side];
        if (flow.offsets[side] >= 0) flow.offsets[side] -= flow.heights[side];
        apply(side);
      });
      rafId = requestAnimationFrame(tick);
    };

    /* ---------- 初始测量与定位 ---------- */
    measure("left");
    measure("right");
    flow.offsets.left = 0;
    flow.offsets.right = -flow.heights.right;
    apply("left");
    apply("right");

    /* ---------- 重测量（图片 load / resize 后，防接缝错位） ---------- */
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const remeasure = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        measure("left");
        measure("right");
        if (flow.offsets.right > 0) flow.offsets.right = -flow.heights.right;
        apply("left");
        apply("right");
      }, 150);
    };
    window.addEventListener("resize", remeasure);
    const imgs = [
      ...Array.from(leftColRef.current?.querySelectorAll("img") ?? []),
      ...Array.from(rightColRef.current?.querySelectorAll("img") ?? []),
    ];
    imgs.forEach((img) => img.addEventListener("load", remeasure));

    /* ---------- 悬停：只暂停所在列（全局 mousemove，100ms 节流） ---------- */
    let lastHoverCheck = 0;
    const onHoverCheck = () => {
      const now = Date.now();
      if (now - lastHoverCheck < 100) return;
      lastHoverCheck = now;
      (["left", "right"] as const).forEach((side) => {
        const col = side === "left" ? leftColRef.current : rightColRef.current;
        if (!col) return;
        flow.paused[side] = !!col.querySelector(".photo-card.is-hovered");
      });
    };

    /* ---------- 卡片悬停：类切换 + 倾斜 + 跟随高光 ---------- */
    const cardOf = (target: EventTarget | null): HTMLElement | null => {
      const el = target as Element | null;
      if (!el || typeof el.closest !== "function") return null;
      return el.closest(".photo-card") as HTMLElement | null;
    };

    const onOver = (e: MouseEvent) => {
      cardOf(e.target)?.classList.add("is-hovered");
    };

    const onOut = (e: MouseEvent) => {
      const card = cardOf(e.target);
      if (!card) return;
      card.classList.remove("is-hovered");
      // 复位（原版用第二个 mouseout 监听做同样的事，这里合并成一个）
      card.style.transform = "";
      card.querySelector<HTMLElement>("img")?.style.removeProperty("transform");
      card.querySelector<HTMLElement>(".photo-info-overlay")?.style.removeProperty("transform");
    };

    const onMove = (e: MouseEvent) => {
      const card = cardOf(e.target);
      if (!card) return;
      const r = card.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * 100;
      const py = ((e.clientY - r.top) / r.height) * 100;
      card.style.setProperty("--mouse-x", px + "%");
      card.style.setProperty("--mouse-y", py + "%");

      if (window.matchMedia("(min-width: 769px)").matches) {
        const ry = ((px - 50) / 50) * 15;
        const rx = -((py - 50) / 50) * 15;
        card.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg) translateZ(30px)`;
        const img = card.querySelector("img") as HTMLElement | null;
        const info = card.querySelector(".photo-info-overlay") as HTMLElement | null;
        if (img) img.style.transform = "translateZ(20px)";
        if (info) info.style.transform = "translateZ(50px)";
      }
    };

    document.addEventListener("mousemove", onHoverCheck, { passive: true });
    document.addEventListener("mouseover", onOver);
    document.addEventListener("mouseout", onOut);
    document.addEventListener("mousemove", onMove, { passive: true });

    /* ---------- 对外 api ---------- */
    const localApi: PhotoFlowApi = {
      getPhotoById: (id) => photos.find((p) => p.id === id) ?? null,
      getAllPhotos: () => photos.slice(),
      pause: () => {
        flow.paused.left = true;
        flow.paused.right = true;
      },
      resume: () => {
        flow.paused.left = false;
        flow.paused.right = false;
      },
      start: () => {
        if (flow.running) return;
        flow.running = true;
        rafId = requestAnimationFrame(tick);
      },
      stop: () => {
        // 只停 rAF 循环；原版仅置 running=false 让 tick 自然断链，
        // 这里额外 cancelAnimationFrame 兜底，避免残留回调
        flow.running = false;
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
      },
    };
    setApi(localApi);

    /* ---------- 只有进入场景 3 才跑 rAF（省电） ---------- */
    const offScene = bus.on(EVT.sceneChange, (d) => {
      const scene = (d as { scene?: number } | undefined)?.scene;
      if (scene === 3) localApi.start();
      else localApi.stop();
    });

    /* ---------- 照片区滚轮微调（clamp ±12px，不切场景） ---------- */
    const offWheel = bus.on(EVT.galleryWheel, (d) => {
      const deltaY = (d as { deltaY?: number } | undefined)?.deltaY;
      if (!deltaY) return;
      const nudge = Math.max(-12, Math.min(12, deltaY * 0.08));
      (["left", "right"] as const).forEach((side) => {
        if (!flow.heights[side]) return;
        flow.offsets[side] -= nudge;
        if (flow.offsets[side] <= -flow.heights[side]) flow.offsets[side] += flow.heights[side];
        if (flow.offsets[side] >= 0) flow.offsets[side] -= flow.heights[side];
        apply(side);
      });
    });

    return () => {
      document.removeEventListener("mousemove", onHoverCheck);
      document.removeEventListener("mouseover", onOver);
      document.removeEventListener("mouseout", onOut);
      document.removeEventListener("mousemove", onMove);
      window.removeEventListener("resize", remeasure);
      imgs.forEach((img) => img.removeEventListener("load", remeasure));
      if (debounceTimer) clearTimeout(debounceTimer);
      if (rafId !== null) cancelAnimationFrame(rafId);
      offScene();
      offWheel();
      setApi(null);
    };
  }, [photos, single, isEmpty]);

  return { leftColRef, rightColRef, leftStripRef, rightStripRef, api, groups, single, isEmpty };
}

export default usePhotoFlow;
