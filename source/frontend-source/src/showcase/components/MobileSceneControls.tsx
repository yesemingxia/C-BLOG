/* MobileSceneControls.tsx — 移动端 Prev / Next 胶囊按钮
 *
 * 迁移自 `person/index.html:52-55`（DOM）+ `script.js:494-497`（事件）。
 *
 * ⚠️ 为什么单独成一个组件而不是塞进 Topbar：
 *    它是 `position: fixed`（z-index 60），而 `.content-track` 带
 *    `transform` + `will-change: transform` —— 在里面 fixed 会退化成 absolute、
 *    位置全错。所以必须渲染在 `.content-track` **外面**，与 Topbar / ProgressUI 同级。
 *    这与「弹窗必须 portal 到第二个 .ssp-scope」是同一个机制。
 *
 * 样式（`.mobile-scene-controls` / `.mobile-scene-btn`）在阶段 3 已全量迁入
 * showcase.css：基础层 `display:none`，@media ≤768px 才显示。本组件只负责渲染。
 *
 * `data-mobile-prev` / `data-mobile-next` 是 DOM 契约，别删 ——
 * useWheelNavigation 的 INTERACTIVE 里也列了 `.mobile-scene-controls`，
 * 保证触摸落在按钮上时不误触发场景滑动手势。
 */

interface MobileSceneControlsProps {
  onPrev: () => void;
  onNext: () => void;
}

const MobileSceneControls = ({ onPrev, onNext }: MobileSceneControlsProps) => (
  <div className="mobile-scene-controls" aria-label="移动端场景导航">
    <button
      className="mobile-scene-btn"
      type="button"
      data-mobile-prev
      aria-label="上一场景"
      onClick={onPrev}
    >
      Prev
    </button>
    <button
      className="mobile-scene-btn"
      type="button"
      data-mobile-next
      aria-label="下一场景"
      onClick={onNext}
    >
      Next
    </button>
  </div>
);

export default MobileSceneControls;
