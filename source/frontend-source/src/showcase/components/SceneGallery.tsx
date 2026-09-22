/* SceneGallery.tsx — 场景 3：3D 照片流
 *
 * 迁移自 `person/index.html:141-146` + `gallery-3d.js:63-111`（buildCard）。
 *
 * 这里只负责**渲染**（卡片 DOM 与两条轨道）；滚动、悬停、倾斜、启停全在 `usePhotoFlow`。
 *
 * ⚠️ 结构契约：
 *    · 卡片必须是 <article class="photo-card">，带 data-photo-id / tabindex / role=button
 *    · 每列内容是**复制两份**首尾相接（无缝循环的前提），所以 key 要带序号去重
 *    · 没图时降级为 `.photo-card-fallback` 渐变块，**绝不破图**
 *      （当前 PHOTOS 的 src 全为空字符串，所以走的就是这条路）
 *    · 3D 倾斜靠舞台的 `perspective: 1000px`，卡片自身不要再写 perspective
 */

import { useState } from "react";
import { PHOTOS, type Photo } from "../lib/photos";
import type { UsePhotoFlowResult } from "../lib/usePhotoFlow";
import { gradientFor } from "../lib/gradients";
import { bus, EVT } from "../lib/bus";

const PhotoCard = ({ photo }: { photo: Photo }) => {
  /** 图片加载失败 → 换成渐变块（原版用 img.onerror 命令式替换，这里用状态） */
  const [imgFailed, setImgFailed] = useState(false);

  const activate = () => bus.emit(EVT.galleryFocus, { photoId: photo.id });

  return (
    <article
      className="photo-card"
      data-photo-id={String(photo.id)}
      tabIndex={0}
      role="button"
      aria-label={`查看照片：${photo.title}`}
      onClick={activate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          activate();
        }
      }}
    >
      {photo.src && !imgFailed ? (
        <img
          src={photo.src}
          alt={photo.title}
          loading="lazy"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <div className="photo-card-fallback" style={{ background: gradientFor(photo.id) }} />
      )}
      <div className="shine-overlay" />
      <div className="photo-info-overlay">
        <div className="photo-title">{photo.title}</div>
        <div className="photo-date">{photo.date}</div>
      </div>
    </article>
  );
};

interface SceneGalleryProps {
  /** 由 Showcase 调用 usePhotoFlow 后传入。
   *  提升到父层的原因：轮播（Carousel）打开时要 pause / 关闭时要 resume 照片流，
   *  而它渲染在 portal 层、不是本组件的子节点，拿不到组件内部的 api。 */
  flow: UsePhotoFlowResult;
}

const SceneGallery = ({ flow }: SceneGalleryProps) => {
  const { leftColRef, rightColRef, leftStripRef, rightStripRef, groups, single, isEmpty } = flow;

  const renderStrip = (side: "left" | "right") => {
    const list = side === "left" ? groups.left : groups.right;
    // 复制两份首尾相接 —— 这是无缝循环的前提，不要改成一份
    return [...list, ...list].map((p, i) => (
      <PhotoCard key={`${side}-${p.id}-${i}`} photo={p} />
    ));
  };

  return (
    <section className="page page-gallery" aria-label="相册">
      <div className="gallery-3d-stage">
        <div className="photo-column photo-column-left" id="photoColumnLeft" ref={leftColRef}>
          {isEmpty ? (
            /* N = 0：空态提示（原版 init 的专门分支）。
               文案访客向；"怎么加照片"写在 lib/photos.ts 的注释里。 */
            <div className="photo-empty">相册暂无照片</div>
          ) : single ? (
            /* N = 1：单列静态，不进循环 */
            <PhotoCard photo={PHOTOS[0]} />
          ) : (
            <div className="photo-track-strip" ref={leftStripRef}>
              {renderStrip("left")}
            </div>
          )}
        </div>

        <div className="photo-column photo-column-right" id="photoColumnRight" ref={rightColRef}>
          {!isEmpty && !single && (
            <div className="photo-track-strip" ref={rightStripRef}>
              {renderStrip("right")}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default SceneGallery;
