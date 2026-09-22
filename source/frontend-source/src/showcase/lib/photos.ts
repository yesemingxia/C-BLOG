/* photos.ts — 场景 3 的相册数据
 *
 * ⚠️ **当前 PHOTOS 是空数组**（2026-09-21 按「保留结构、清空数据」处理）。
 *
 * person 侧原有 12 条示例照片（晨雾 / 旧墙 / 夜航 …），那是作者的个人相册内容，
 * 与博客定位不符，已清空。而且它们的 `src` **本来就是空字符串**，
 * 渲染出来只是渐变占位色块 —— 也就是说那 12 条数据从始至终没有承载过真实图片。
 *
 * **结构与交互完好无损**：双列反向无缝滚动、悬停单列暂停、3D 倾斜、跟随鼠标高光、
 * 点击开轮播（拖拽 / 方向键 / 边界不循环 / 计数器 n / N）全部照常工作。
 *
 * 三条边界分支都保留着（原版 `init()` 里就有）：
 *   · N = 0 → 显示空态提示
 *   · N = 1 → 单列静态，不进循环
 *   · N ≥ 2 → 正常双列反向滚动
 */

export interface Photo {
  /** 1..N，轮播定位用 */
  id: number;
  /** 图片地址；留空则用渐变色块兜底（不会破图） */
  src: string;
  title: string;
  /** 轮播中展示的完整描述 */
  description: string;
  /** 'YYYY.MM' */
  date: string;
}

export const PHOTOS: Photo[] = [];

/* 填空模板 —— 图片放进 public/showcase/assets/gallery/，然后按这个形状填：

  { id: 1, src: "/showcase/assets/gallery/photo1.jpg", title: "晨雾", description: "清早山口的雾。", date: "2026.08" },
  { id: 2, src: "/showcase/assets/gallery/photo2.jpg", title: "旧墙", description: "斑驳的墙面。",   date: "2026.07" },

  注：
   · `id` 从 1 递增，轮播靠它定位
   · **分列由 `index % 2` 自动决定，没有 `column` 字段** —— 手动加不会生效（person 早期版本的废弃字段）
   · 建议横图（样式是 `object-fit: cover`），数量随意
   · 标题写 4~6 字、日期按月递减，视觉上更整齐（person 的做法）
*/

export const findPhoto = (id: number): Photo | null => PHOTOS.find((p) => p.id === id) ?? null;

export default PHOTOS;
