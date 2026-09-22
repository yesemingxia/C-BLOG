/* gradients.ts — 无图时的渐变兜底表
 *
 * 原版在 `gallery-3d.js:31-38` 和 `gallery-carousel.js:20-27` 各定义了一份**完全相同**的
 * 6 色渐变数组（对照表 Q-13 记录的重复）。迁移时合并到一处，
 * 照片卡与轮播共用，避免两边改一处忘一处。
 */

export const GRADIENTS = [
  "linear-gradient(135deg, #1E3B45, #08131A)",
  "linear-gradient(135deg, #4A3A20, #120E08)",
  "linear-gradient(135deg, #22314F, #080C16)",
  "linear-gradient(135deg, #1E4238, #08120F)",
  "linear-gradient(135deg, #3B2440, #0D0812)",
  "linear-gradient(135deg, #2C3A46, #0A0F14)",
] as const;

/** 按照片 id（1-based）取渐变，越界自动回绕 */
export const gradientFor = (id: number): string => GRADIENTS[(id - 1) % GRADIENTS.length];

export default GRADIENTS;
