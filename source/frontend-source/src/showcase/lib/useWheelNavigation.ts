/* useWheelNavigation.ts — 输入路由
 *
 * 迁移自 person/script.js 的：
 *   · handleWheel（滚轮）
 *   · touchstart / touchmove / touchend 三件套
 *   · 键盘导航（↑↓←→ / PageUp/PageDown / Home / Enter）
 *
 * 2026-09-21：场景 3 由照片流改为 Markdown 编辑器后，原先「滚轮落在照片互动区时
 * 派发 `gallery:wheel` 微调轨道」那一段已移除 —— 没有相册再听这个事件，
 * 留着只会把场景 3 中央区域的小幅滚轮无声吃掉（看着像滚轮坏了）。
 *
 * 同上日期：新增「**黑框内滚轮只滚文章、不翻页**」规则（场景 3）。编辑器与
 * `.contact-layout` 那种可滚动区域**规则不同** —— 后者滑到边界翻页是对的，
 * 编辑器里滑到底只说明「这段看完了」，不代表想离开。
 * 判定按**指针位置**（`.editor-shell`）而不是"是否聚焦"，详见 `inEditor()`。
 *
 * ⚠️ 两个必须注意的点：
 *
 * 1. **绝不能用 React 的 onWheel / onTouchMove**。React 把这两个合成事件注册在
 *    passive 监听器上，`preventDefault()` 会被忽略并打印控制台警告 ——
 *    而这里恰恰必须 preventDefault（滚轮不阻止的话页面会自己滚，触摸同理）。
 *    所以用 addEventListener 手动绑，显式写 { passive: false }。
 *
 * 2. **监听器挂在 window / document 上，不是组件节点上**。滚轮可能落在任何位置
 *    （含 fixed 的顶栏、舞台、弹窗背板），挂节点会漏事件。
 */

import { useEffect } from "react";
import { CONFIG } from "../config";
import type { SceneMachineApi } from "./useSceneMachine";

/** 触摸开始时落在这些元素上，就不算场景切换手势（照抄 script.js:393） */
const INTERACTIVE =
  "button,a,input,textarea,select,label,.project-modal-card,.audio-control-panel,.mobile-scene-controls,.carousel-overlay";

export function useWheelNavigation(api: SceneMachineApi | null): void {
  useEffect(() => {
    if (!api) return;

    const st = api.state;
    let touchStart: { x: number; y: number; target: EventTarget | null } | null = null;

    const isMobileViewport = () =>
      window.matchMedia(`(max-width: ${CONFIG.mobileBreakpoint}px)`).matches;

    /* ------------------------------------------------------------------
     * 场景内的可滚动区域优先消费滚轮 —— 滑到边界才翻页
     *
     * person 原版**没有**这层判断：任何滚轮都被 preventDefault 吃掉、直接翻场景。
     * 后果是小屏（≤1024px）下联系页的 `.contact-layout` 虽然写了 overflow-y:auto，
     * 却根本滚不动 —— 内容被截断，又没法滚回来看（一滚就翻到上一个场景）。
     * 这是原版的固有缺陷，迁移时修掉。
     *
     * 判定：从事件目标向上找第一个「垂直可滚动、且当前方向还没到边界」的祖先。
     *   找到 → 不 preventDefault，让它自己滚
     *   没找到（不可滚 / 已到顶或底）→ 继续走场景切换
     *
     * deltaY 的正负与"想看哪边"的对应：
     *   deltaY > 0（向下滚，想看下面）→ 容器还没到底，让给它
     *   deltaY < 0（向上滚，想看上面）→ 容器还没到顶，让给它
     *   deltaY === 0 → 只判断"是不是可滚动区域"（给触摸用）
     * ------------------------------------------------------------------ */
    function findScrollable(target: EventTarget | null, deltaY: number): HTMLElement | null {
      /* ⚠️ target 未必是 Element —— 脚本派发的 wheel（target = window）、
         部分合成事件都会这样。直接 `getComputedStyle(window)` 会抛 TypeError，
         异常冒到 handleWheel 外层就把**整条滚轮链路打断**（表现为滚轮完全没反应）。
         真实浏览器里用户滚动时 target 总是元素，但这个防御不能省 ——
         无头测试用合成事件跑一次就复现了。 */
      if (!(target instanceof Element)) return null;
      let el: HTMLElement | null = target as HTMLElement;
      while (el && el !== document.body && el !== document.documentElement) {
        const overflowY = getComputedStyle(el).overflowY;
        const scrollable =
          (overflowY === "auto" || overflowY === "scroll") && el.scrollHeight > el.clientHeight + 1;
        if (scrollable) {
          if (deltaY > 0) {
            if (el.scrollTop + el.clientHeight < el.scrollHeight - 1) return el; // 还没到底
          } else if (deltaY < 0) {
            if (el.scrollTop > 0) return el; // 还没到顶
          } else {
            return el;
          }
        }
        el = el.parentElement;
      }
      return null;
    }

    /* ------------------------------------------------------------------
     * 场景 3 编辑器：**黑框内滚轮只滚文章，永不翻页**
     *
     * 2026-09-21 二次调整：原实现只判「焦点在编辑器内」（activeElement），
     * 于是出现一个别扭的中间态 —— 鼠标明明停在黑框里，但没点过输入框（未聚焦），
     * 一滚到底照样翻页。用户要的是**位置**语义：指针在黑框内 → 这一屏的滚轮
     * 全部归编辑区，翻页这件事根本不发生。
     *
     * 所以判定从「焦点」改为「事件目标是否在 `.editor-shell`（黑框）内」，
     * 并保留焦点判定作为补充（打字时指针偶尔飘到框外也不会误翻页）。
     *
     * 与 `.contact-layout` 那类「可滚动区域滑到边界才翻页」是**不同的规则**：
     * 那里滚到底翻页是对的（读完了自然往下走），编辑器里滚到底只是
     * 「我看完了这一段」，不代表想离开这一屏 —— 所以**不做边界判断**。
     *
     * 想翻页怎么办：把鼠标移到黑框外（标题区 / 页面底部留白）再滚；
     * 或点顶部导航点、移动端 Prev / Next。不会被困在这一屏。
     * ------------------------------------------------------------------ */
    function inEditor(target: EventTarget | null): boolean {
      if (target instanceof Element) {
        // `.editor-shell` 是那个黑框；发布面板打开时不受此规则影响（detailOpen 已先行拦截）
        if (target.closest(".editor-shell")) return true;
      }
      const ae = document.activeElement;
      return !!(ae && ae instanceof Element && ae.closest(".page-editor"));
    }

    /* ---------------- 滚轮 ---------------- */
    function handleWheel(e: WheelEvent): void {
      if (st.introActive) {
        e.preventDefault();
        return;
      }
      if (st.detailOpen) return;

      // 黑框内（或正在编辑）：滚轮完全交给编辑器，不参与场景切换
      if (inEditor(e.target)) return;

      // 场景内的可滚动区域先滚，滑到顶/底才轮到翻页
      // 注意这里**不能** preventDefault —— 否则容器滚不动，就退回原版那个缺陷了
      if (findScrollable(e.target, e.deltaY)) return;

      e.preventDefault();

      const d = e.deltaY;

      // 场景 2 的 intro 播放中：滚轮 = 跳过（不做节流，也刻意不走 navigate 的节流分支）
      if (st.phase === "scene2-intro") {
        if (d > CONFIG.wheelThreshold) api!.navigate("next");
        else if (d < -CONFIG.wheelThreshold) api!.navigate("prev");
        return;
      }

      /* 场景 2 文章网格：**没有**专门的滚轮翻页 —— 网格本身是可滚动区
         （showcase-posts.css 给桌面端也加了 max-height + overflow-y:auto），
         上面的 findScrollable 会先让它一点点滚内容；滚到边界才轮到场景切换。
         曾试过「网格内滚轮翻文章页」，但看文章时太容易误翻页，已移除 ——
         翻文章页只走「上一页 / 下一页」按钮（带软翻页动画）。 */

      const now = Date.now();
      if (now - st.lastNav < CONFIG.wheelThrottle) return;
      if (Math.abs(d) < CONFIG.wheelThreshold) return;
      st.lastNav = now;
      api!.navigate(d > 0 ? "next" : "prev");
    }

    /* ---------------- 触摸 ---------------- */
    function onTouchStart(e: TouchEvent): void {
      if (st.introActive || !isMobileViewport()) return;
      const target = e.target as Element | null;
      if (target && typeof target.closest === "function" && target.closest(INTERACTIVE)) {
        touchStart = null;
        return;
      }
      /* 触摸起点落在场景 3 的黑框内 → 整块交给编辑器自己滚，不走场景手势。
         与滚轮同一条规则（黑框内 = 只滚文章），选择器也统一用 `.editor-shell`；
         INTERACTIVE 只挡住了 input/textarea，预览区与工具条不带那些标签，
         所以这里要按面板范围再挡一次。移动端有 Prev/Next 按钮兜底，不会被困住。 */
      if (target && typeof target.closest === "function" && target.closest(".editor-shell")) {
        touchStart = null;
        return;
      }
      const t = e.touches[0];
      // 记下起点元素：touchend 要靠它判断手势是否该交给可滚动容器
      touchStart = { x: t.clientX, y: t.clientY, target: e.target };
    }

    function onTouchMove(e: TouchEvent): void {
      if (!touchStart || !isMobileViewport()) return;
      const t = e.touches[0];
      const dx = t.clientX - touchStart.x;
      const dy = t.clientY - touchStart.y;
      if (Math.abs(dy) < Math.abs(dx)) return; // 横向滑动还给相册/轮播
      // 竖向手势：若可滚动容器还能朝该方向滚，就让它自己滚、不拦截
      const dir = dy < 0 ? 1 : -1;
      if (!findScrollable(touchStart.target, dir)) e.preventDefault();
    }

    function onTouchEnd(e: TouchEvent): void {
      if (!touchStart) return;
      const startTarget = touchStart.target;
      const t = e.changedTouches[0];
      const dx = t.clientX - touchStart.x;
      const dy = t.clientY - touchStart.y;
      touchStart = null;
      if (!isMobileViewport() || st.introActive) return;
      if (Math.abs(dy) < CONFIG.touchThreshold || Math.abs(dy) < Math.abs(dx)) return;

      // 手指上滑（dy<0）＝想看下面 → 对应 deltaY 方向 +1；下滑反之。
      // 容器还能朝该方向滚就不翻页，与滚轮那条保持一致。
      const dir = dy < 0 ? 1 : -1;
      if (findScrollable(startTarget, dir)) return;

      const now = Date.now();
      if (now - st.lastTouch < CONFIG.touchThrottle) return;
      st.lastTouch = now;
      api!.navigate(dy < 0 ? "next" : "prev");
    }

    /* ---------------- 键盘 ---------------- */
    function onKeyDown(e: KeyboardEvent): void {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (st.detailOpen) return;

      if (st.introActive) {
        // 入场层期间 Enter / Space 也等于点「进入网站」
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          api!.enterSite();
        }
        return;
      }

      if (e.key === "ArrowDown" || e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        api!.navigate("next");
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        api!.navigate("prev");
      } else if (e.key === "Home") {
        e.preventDefault();
        api!.goHome();
      }
    }

    window.addEventListener("wheel", handleWheel, { passive: false });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    document.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("wheel", handleWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [api]);
}

export default useWheelNavigation;
