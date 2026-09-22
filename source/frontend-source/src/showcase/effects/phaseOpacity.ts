/* phaseOpacity.ts — 各 phase 下的特效不透明度
 *
 * 迁移自 `person/effects-init.js:72-78`。原版就是**集中定义**在编排层的一张表，
 * 同时管水波纹与频谱两个 canvas —— 迁移时抽到这里，避免两个组件各存一份、改一处忘一处
 * （对照表 Q-13 记过「两处渐变表重复」的教训）。
 *
 * key 是**归一化后**的 data-phase（去掉了 -idle / -intro 后缀，规则同 script.js:70）。
 * 未命中的 phase 回落到 scene1 那一档 —— 原版行为。
 */

export interface PhaseOpacity {
  ripple: number;
  spectrum: number;
}

export const PHASE_OPACITY: Record<string, PhaseOpacity> = {
  scene1: { ripple: 0.8, spectrum: 0.8 },
  scene2: { ripple: 0.9, spectrum: 0.85 },
  scene3: { ripple: 0.7, spectrum: 0.8 },
  scene4: { ripple: 0.55, spectrum: 0.7 },
  transition: { ripple: 0.5, spectrum: 0.5 },
};

/** 取某个 phase 下指定特效的不透明度；phase 未命中时回落 scene1 */
export const opacityFor = (phase: string, which: keyof PhaseOpacity): number =>
  (PHASE_OPACITY[phase] ?? PHASE_OPACITY.scene1)[which];

export default PHASE_OPACITY;
