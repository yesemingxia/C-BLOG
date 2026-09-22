/* ProgressUI.tsx — 底部进度条 + 状态文本
 *
 * 迁移自 index.html:207-210 与 script.js:443-456（frameLoop）。
 *
 * 两个刻意的设计：
 *   1. 进度条的 `<i>` 元素挂到 progressBarRef，由 useSceneMachine 的 frameLoop
 *      **每帧直接写 style.width**，不走 React state —— 否则 60fps 重渲染整棵树。
 *   2. 状态文本取自当前背景源的 `label`（SCENE_SOURCES 里声明），不是硬编码字符串。
 *      所以换素材改 sceneSources.ts 就能同步改文案。
 */

import type { RefObject } from "react";

interface ProgressUIProps {
  sourceLabel: string;
  progressBarRef: RefObject<HTMLElement | null>;
}

const ProgressUI = ({ sourceLabel, progressBarRef }: ProgressUIProps) => (
  <div className="progress-ui" aria-hidden="true">
    <span id="stateText">{sourceLabel}</span>
    <span className="progress-line">
      <i ref={progressBarRef} id="progressBar" />
    </span>
  </div>
);

export default ProgressUI;
