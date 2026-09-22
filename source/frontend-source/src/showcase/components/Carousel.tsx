/* Carousel.tsx — 全屏堆叠轮播
 *
 * 迁移自 `person/gallery-carousel.js`。
 *
 * ⚠️ 四个不能改的细节：
 *   1. 这是**堆叠式**，只有 `translateX` + `scale`，**不是 3D**
 *      （`.carousel-slides` 上有 `perspective: 2000px` 但当前没用到，真要做 3D 可复用）。
 *   2. 滑块是 `position:absolute` 且**不给 top/left**，靠 `.carousel-slides` 的 flex 居中。
 *      所以位移里**绝不能**写 `translate(-50%,-50%)` —— 会让整组偏移到左上角。
 *   3. **边界不循环**：第 1 张时 prev 禁用，最后一张时 next 禁用。
 *   4. 计数器用实际长度 `n / N`，**不写死 12**。
 *
 * 显隐交给父组件 portal 到 `.ssp-scope.ssp-portal-root`（见 Showcase.tsx），
 * 因为直接挂 body 会脱离 .ssp-scope，`.carousel-*` 的样式一条都不命中。
 */

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { bus, EVT } from "../lib/bus";
import { gradientFor } from "../lib/gradients";
import type { Photo } from "../lib/photos";
import type { PhotoFlowApi } from "../lib/usePhotoFlow";

/** 当前张 ±2 参与渲染，更远的整块隐藏（省性能） */
const VISIBLE_RANGE = 2;
/** 拖拽超过这个像素才算翻页 */
const DRAG_THRESHOLD = 100;

interface CarouselProps {
  photos: Photo[];
  /** 相册流 api：打开时暂停滚动、关闭时恢复 */
  flowApi: PhotoFlowApi | null;
}

const Carousel = ({ photos, flowApi }: CarouselProps) => {
  /** -1 = 关闭；>= 0 = 当前索引 */
  const [index, setIndex] = useState(-1);
  const open = index >= 0;

  const startXRef = useRef<number | null>(null);
  const total = photos.length;

  /* ---------------- 打开：监听 gallery:focus ---------------- */
  useEffect(
    () =>
      bus.on(EVT.galleryFocus, (d) => {
        const id = (d as { photoId?: number } | undefined)?.photoId;
        if (id == null) return;
        const i = photos.findIndex((p) => p.id === id);
        if (i >= 0) setIndex(i);
      }),
    [photos],
  );

  /* ---------------- 打开期间：暂停照片流 + 禁止 body 滚动 ---------------- */
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    flowApi?.pause();
    return () => {
      document.body.style.overflow = "";
      flowApi?.resume();
    };
  }, [open, flowApi]);

  /* ---------------- 切换（边界不循环） ---------------- */
  const go = useCallback(
    (i: number) => {
      if (i < 0 || i > total - 1) return;
      setIndex(i);
    },
    [total],
  );

  /* ---------------- 键盘 ← / → / Esc ---------------- */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") go(index - 1);
      else if (e.key === "ArrowRight") go(index + 1);
      else if (e.key === "Escape") setIndex(-1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, index, go]);

  /* ---------------- 拖拽 / 滑动 ---------------- */
  const dragEnd = (x: number) => {
    if (startXRef.current === null) return;
    const dx = x - startXRef.current;
    startXRef.current = null;
    if (Math.abs(dx) < DRAG_THRESHOLD) return;
    go(index + (dx < 0 ? 1 : -1));
  };

  if (!open) return null;

  /** 每张幻灯片的层叠位置（对应原版 layout()） */
  const slideStyle = (i: number): CSSProperties => {
    const off = i - index;
    const abs = Math.abs(off);
    if (abs > VISIBLE_RANGE) {
      return { visibility: "hidden", opacity: 0, zIndex: 0, transform: "translateX(0) scale(.5)" };
    }
    if (off === 0) return { visibility: "visible", opacity: 1, zIndex: 10, transform: "translateX(0) scale(1)" };
    if (off === -1) return { visibility: "visible", opacity: 0.4, zIndex: 5, transform: "translateX(-70%) scale(.85)" };
    if (off === 1) return { visibility: "visible", opacity: 0.4, zIndex: 5, transform: "translateX(70%) scale(.85)" };
    return { visibility: "visible", opacity: 0.2, zIndex: 1, transform: `translateX(${off * 100}%) scale(.7)` };
  };

  const slideClass = (i: number): string => {
    const off = i - index;
    const abs = Math.abs(off);
    if (abs > VISIBLE_RANGE) return "carousel-slide is-hidden";
    if (off === 0) return "carousel-slide is-active";
    if (off === -1) return "carousel-slide is-prev";
    if (off === 1) return "carousel-slide is-next";
    return "carousel-slide";
  };

  return (
    <div
      className="carousel-overlay is-active"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        // 点遮罩空白处关闭（点内容不关）
        if (e.target === e.currentTarget) setIndex(-1);
      }}
    >
      <div className="carousel-container">
        <div
          className="carousel-slides"
          onMouseDown={(e) => {
            startXRef.current = e.clientX;
          }}
          onTouchStart={(e) => {
            startXRef.current = e.touches[0].clientX;
          }}
          onMouseUp={(e) => dragEnd(e.clientX)}
          onTouchEnd={(e) => dragEnd(e.changedTouches[0].clientX)}
        >
          {photos.map((p, i) => (
            <div key={p.id} className={slideClass(i)} data-index={i} style={slideStyle(i)}>
              <div className="carousel-slide-content">
                <div className="carousel-image-wrapper">
                  {p.src ? (
                    <img
                      className="carousel-image"
                      /* 懒加载：只加载当前张 ±1（原版用 data-src 延迟赋值） */
                      src={Math.abs(i - index) <= 1 ? p.src : undefined}
                      data-src={p.src}
                      alt={p.title}
                    />
                  ) : (
                    <div
                      className="carousel-image-fallback"
                      style={{ width: "100%", height: "100%", background: gradientFor(p.id) }}
                    />
                  )}
                </div>
                <div className="carousel-info">
                  <h2 className="carousel-title">{p.title}</h2>
                  <p className="carousel-description">{p.description}</p>
                  <time className="carousel-date">{p.date}</time>
                </div>
              </div>
            </div>
          ))}
        </div>

        <button
          className="carousel-nav carousel-nav-prev"
          type="button"
          aria-label="上一张"
          disabled={index === 0}
          onClick={() => go(index - 1)}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>

        <button
          className="carousel-nav carousel-nav-next"
          type="button"
          aria-label="下一张"
          disabled={index === total - 1}
          onClick={() => go(index + 1)}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>

        <button
          className="carousel-close"
          type="button"
          aria-label="关闭"
          onClick={() => setIndex(-1)}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        <div className="carousel-counter">
          <span className="carousel-current">{index + 1}</span> /{" "}
          <span className="carousel-total">{total}</span>
        </div>
      </div>
    </div>
  );
};

export default Carousel;
