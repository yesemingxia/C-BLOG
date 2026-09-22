/* useSceneMachine.ts — 场景状态机 + 背景源编排
 *
 * 迁移自 person/script.js 的这几块：
 *   · 状态机（10 个 phase + lock/unlock + goScene1..4 + goBackToScene2/3）
 *   · 场景 2 的跳过（滚轮中途跳走）与离场动效
 *   · moveTo()：写 --scene-index + 轨道 transitionDuration
 *   · frameLoop()：进度条推进 + scene2 尾帧接管判定
 *   · visibilitychange 省电、source:ready 时长同步
 *
 * 不在这里的（各归其位）：
 *   · 输入路由（wheel / touch / 键盘）→ useWheelNavigation.ts
 *   · 表单提交 → SceneContact.tsx（阶段 4）
 *   · 入场层 DOM 与音频起播 → IntroOverlay.tsx
 *   · applyPersona() → 直接 JSX 渲染（原版用 textContent 会抹掉子节点，见 MIGRATION_PLAN §2.2）
 *
 * ⚠️ **状态转移的判定条件原样保留，只换写法。**
 *    `DESIGN_DEV_PLAN.md` 把这段称为"全站最脆、最难调的部分"——任何"顺手优化"都别做。
 *    phase 名、去后缀规则、locked 的加锁时机、各种 flag 的先后顺序，全部照抄。
 */

import { useEffect, useRef, useState, type RefObject } from "react";
import { bus, EVT } from "./bus";
import { CONFIG } from "../config";
import { createSources, isVideoSource, type SceneSource } from "./BackgroundSource";

export type Phase =
  | "scene1-idle"
  | "transition"
  | "scene2-intro"
  | "scene2-idle"
  | "transition-2-3"
  | "scene3-idle"
  | "transition-3-2"
  | "transition-3-4"
  | "scene4-idle"
  | "transition-4-3";

/** 全部 10 个 phase，供测试与调试枚举 */
export const ALL_PHASES: readonly Phase[] = [
  "scene1-idle",
  "transition",
  "scene2-intro",
  "scene2-idle",
  "transition-2-3",
  "scene3-idle",
  "transition-3-2",
  "transition-3-4",
  "scene4-idle",
  "transition-4-3",
];

/** 状态文案的覆盖表（修正原版的一处疏漏）
 *
 * `person/script.js:76-84` 的 `currentSourceKey()` **没有 scene4 分支**：
 * 走 default 时 `state.scene !== 1` → 返回 `scene2Idle`，
 * 于是**场景 4 的底部状态文案错误地显示 "Scene 02 · Last Second Loop"**
 * （无头浏览器实测截图确认原版就是如此）。2↔3、3↔4 两对转场同理。
 *
 * 这里只给"没有对应背景源"的这几个 phase 补文案；其余仍然走
 * `SCENE_SOURCES[key].label` —— 对照表 N-02「状态文本取自源的 label，
 * 不是硬编码字符串」的设计没有被破坏，只是补上了缺失的那几个。
 *
 * `sourceLabel` 仅用于 ProgressUI 显示，改这里没有别的副作用。 */
const PHASE_LABEL: Partial<Record<Phase, string>> = {
  "transition-2-3": "Transition 02 → 03",
  "transition-3-2": "Transition 03 → 02",
  "transition-3-4": "Transition 03 → 04",
  "transition-4-3": "Transition 04 → 03",
  "scene4-idle": "Scene 04 · Contact",
};

/** 即时状态。放在一个普通对象里（不是 React state），
 *  因为导航路由每个事件都要读它，走 state 会踩闭包陷阱并触发无谓重渲染。 */
export interface MachineState {
  phase: Phase;
  scene: number;
  locked: boolean;
  introActive: boolean;
  scene2IdleStarted: boolean;
  scene2SkipStarted: boolean;
  isScene2Leaving: boolean;
  scene3LoopStarted: boolean;
  lastNav: number;
  lastTouch: number;
  detailOpen: boolean;
}

export interface SceneMachineApi {
  navigate(dir: "next" | "prev"): void;
  goToScene(n: 1 | 2 | 3 | 4): void;
  goHome(): void;
  enterSite(): void;
  setDetailOpen(open: boolean): void;
  /** 即时状态（引用稳定，属性会变）—— 输入路由直接读 */
  state: MachineState;
  sources: Record<string, SceneSource>;
}

export interface UseSceneMachineOptions {
  /** `.ssp-scope` 元素：data-phase / data-detail-open 写在它上面 */
  scopeRef: RefObject<HTMLDivElement | null>;
  /** `#videoStage`：背景源挂载点 */
  stageRef: RefObject<HTMLDivElement | null>;
  /** `#contentTrack`：写 transitionDuration 用 */
  trackRef: RefObject<HTMLDivElement | null>;
}

export interface UseSceneMachineResult {
  phase: Phase;
  scene: number;
  sourceLabel: string;
  introActive: boolean;
  detailOpen: boolean;
  /** 场景 2 离场中（卡片上移淡出），驱动 .project-cards-grid 的 is-leaving */
  scene2Leaving: boolean;
  /** 归一化后的 data-phase，供水波纹等"按 phase 调节"的地方使用 */
  dataPhase: string;
  api: SceneMachineApi | null;
  /** 进度条的 `<i>` 元素挂到这个 ref 上，frameLoop 直接写 width（不走 React state，避免每帧重渲染） */
  progressBarRef: RefObject<HTMLElement | null>;
}

export function useSceneMachine({
  scopeRef,
  stageRef,
  trackRef,
}: UseSceneMachineOptions): UseSceneMachineResult {
  const [phase, setPhaseReact] = useState<Phase>("scene1-idle");
  const [scene, setSceneReact] = useState(1);
  const [sourceLabel, setSourceLabel] = useState("");
  // @cuiruoni+本会话点过「进入网站」后（sessionStorage 标记），登录/返回首页再进来
  // 不再重放入场层 —— 用户明确不要每次都过一遍「进入网站」。
  const [introActive, setIntroActiveReact] = useState(
    () => sessionStorage.getItem("ssp-intro-done") !== "1",
  );
  const [detailOpen, setDetailOpenReact] = useState(false);
  /** 场景 2 离场中的 React 镜像（原版直接给 #projectGrid 加 class，这里由 state 驱动） */
  const [scene2Leaving, setScene2Leaving] = useState(false);
  /** 归一化后的 data-phase（去掉 -idle / -intro 后缀）。原版写在 body 上，
   *  这里额外作为 React state 暴露 —— 水波纹要按 phase 调透明度。 */
  const [dataPhase, setDataPhase] = useState("scene1");
  const [api, setApi] = useState<SceneMachineApi | null>(null);

  const progressBarRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    /* ================= 即时状态（对应 script.js 的 state 对象） ================= */
    const st: MachineState = {
      phase: "scene1-idle",
      scene: 1,
      locked: false,
      introActive: sessionStorage.getItem("ssp-intro-done") !== "1",
      scene2IdleStarted: false,
      scene2SkipStarted: false,
      isScene2Leaving: false,
      scene3LoopStarted: false,
      lastNav: 0,
      lastTouch: 0,
      detailOpen: false,
    };

    const sources = createSources(stage);

    let scene2ExitTimer: ReturnType<typeof setTimeout> | null = null;
    /** 所有 setTimeout 统一收集，卸载时全清（原版散落各处且未保存引用） */
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let rafId: number | null = null;
    let disposed = false;

    /* ================= 基础设施 ================= */

    function runLater(fn: () => void, ms: number): ReturnType<typeof setTimeout> {
      const id = setTimeout(() => {
        timers.delete(id);
        if (disposed) return;
        try {
          fn();
        } catch (e) {
          console.error(e);
        }
      }, ms);
      timers.add(id);
      return id;
    }

    function updateAppHeight(): void {
      const h = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
      document.documentElement.style.setProperty("--app-height", h + "px");
    }

    /* ================= 基础动作 ================= */

    function setPhase(p: Phase): void {
      st.phase = p;
      setPhaseReact(p);

      // 原版写 body.dataset.phase；这里写 .ssp-scope（body 不能进作用域，见 showcase.css 顶部注释）
      // 去后缀规则照抄 script.js:70，一个字节都不能改
      const norm = p.replace("-idle", "").replace("-intro", "");
      const scope = scopeRef.current;
      if (scope) scope.dataset.phase = norm;
      setDataPhase(norm);

      // 状态文案：先看覆盖表（scene4 与三对转场没有对应背景源），再回落到源的 label
      const override = PHASE_LABEL[p];
      if (override) {
        setSourceLabel(override);
      } else {
        const src = sources[currentSourceKey()];
        setSourceLabel((src && src.label) || "Scene 0" + st.scene);
      }

      // 进度条 rAF 按 phase 启停（见下方 frameTick 的说明）
      if (needsFrameLoop()) startFrameLoop();
    }

    /** 当前 phase 该显示哪个背景源（照抄 script.js:76-84） */
    function currentSourceKey(): string {
      switch (st.phase) {
        case "transition":
          return "transition";
        case "scene2-intro":
          return "scene2";
        case "scene2-idle":
          return "scene2Idle";
        case "scene3-idle":
          return "scene3Loop";
        default:
          return st.scene === 1 ? "scene1" : "scene2Idle";
      }
    }

    function showOnly(keys: string[]): void {
      Object.keys(sources).forEach((k) => {
        const on = keys.indexOf(k) !== -1;
        const s = sources[k];
        s.setVisible(on);
        if (!on && s.pause) s.pause();
      });
    }

    function moveTo(index: number, ms?: number): void {
      st.scene = index + 1;
      setSceneReact(index + 1);
      const track = trackRef.current;
      if (track) track.style.transitionDuration = (ms || CONFIG.sceneShiftMs) + "ms";
      // 写 documentElement —— 所以 --scene-index 只能声明在 :root，不能在 .ssp-scope 里
      document.documentElement.style.setProperty("--scene-index", String(index));
    }

    function emitSceneChange(sc: number): void {
      bus.emit(EVT.sceneChange, { scene: sc });
    }

    function lock(): void {
      st.locked = true;
    }
    function unlock(): void {
      st.locked = false;
    }

    function resetProgress(): void {
      const bar = progressBarRef.current;
      if (bar) bar.style.width = "0%";
    }

    function setProgressPct(pct: number): void {
      const bar = progressBarRef.current;
      if (bar) bar.style.width = Math.round(pct) + "%";
    }

    /** 转场基准时长：transition 源的真实时长（拿不到就用声明值），下限 1200ms */
    function transitionMs(): number {
      const t = sources.transition;
      return Math.max(1200, (t && t.durationMs) || CONFIG.sceneShiftFarMs);
    }

    /* ================= 场景流转 ================= */

    // 1 → 2
    function goScene2(): void {
      if (st.locked || st.introActive) return;
      lock();
      st.scene2IdleStarted = false;
      st.scene2SkipStarted = false;
      resetScene2Exit();
      resetProgress();

      const src = sources.transition;
      setPhase("transition");
      document.documentElement.style.setProperty("--transition-ms", src.durationMs + "ms");
      showOnly(["transition"]);
      src.reset();
      src.play(true);
      moveTo(1, src.durationMs);

      // ended + timer 双保险（whenComplete 内部已实现）
      src.whenComplete(() => startScene2Intro());
    }

    // 转场播完 → scene2 入场
    function startScene2Intro(): void {
      if (st.phase !== "transition") return;
      showOnly(["scene2"]);
      sources.scene2.reset();
      sources.scene2.play(true);
      setPhase("scene2-intro");
      unlock();
    }

    // scene2 尾声 → 尾帧循环
    function enterScene2Idle(): void {
      if (st.scene2IdleStarted) return;
      st.scene2IdleStarted = true;
      showOnly(["scene2Idle"]);
      sources.scene2Idle.reset();
      sources.scene2Idle.play(true);
      sources.scene2.pause();
      setProgressPct(100);
      setPhase("scene2-idle");
      unlock();
      emitSceneChange(2);
    }

    // scene2 离场（卡片上移淡出 320ms）→ scene3
    function startScene2ExitToScene3(opts?: { skipScene2Intro?: boolean }): void {
      const o = opts || {};
      if (st.isScene2Leaving || st.scene2SkipStarted) return;
      if (st.phase !== "scene2-idle" && st.phase !== "scene2-intro") return;

      st.isScene2Leaving = true;
      setScene2Leaving(true);
      lock();

      const visibleKey = st.phase === "scene2-idle" ? "scene2Idle" : "scene2";
      showOnly([visibleKey]);
      sources[visibleKey].play(false);

      const exitId = setTimeout(() => {
        scene2ExitTimer = null;
        timers.delete(exitId);
        if (disposed) return;
        const shouldSkipIntro = !!o.skipScene2Intro && st.phase === "scene2-intro";
        if (!shouldSkipIntro) unlock();
        if (st.phase === "scene2-intro") setProgressPct(100);
        goScene3({ skipScene2Intro: shouldSkipIntro, fromScene2Exit: true });
      }, CONFIG.scene2ExitDelay);
      scene2ExitTimer = exitId;
      timers.add(exitId);
    }

    function resetScene2Exit(opts?: { clearTimer?: boolean }): void {
      const o = opts || {};
      st.isScene2Leaving = false;
      setScene2Leaving(false);
      if (o.clearTimer !== false && scene2ExitTimer) {
        clearTimeout(scene2ExitTimer);
        timers.delete(scene2ExitTimer);
        scene2ExitTimer = null;
      }
    }

    // 2 → 3
    function goScene3(opts?: { skipScene2Intro?: boolean; fromScene2Exit?: boolean }): void {
      const o = opts || {};
      const canSkipIntro = !!o.skipScene2Intro && st.phase === "scene2-intro";
      if (st.scene2SkipStarted) return;
      if (!o.fromScene2Exit && !canSkipIntro && (st.locked || st.phase !== "scene2-idle")) return;

      if (canSkipIntro) {
        st.scene2SkipStarted = true;
        st.scene2IdleStarted = true;
      }
      lock();
      setPhase("transition-2-3");

      const shift = Math.max(CONFIG.minSceneShiftMs, transitionMs());
      const start = () => {
        showOnly(["scene3"]);
        sources.scene3.reset();
        sources.scene3.play(true);
        moveTo(2, shift);

        sources.scene3.whenComplete(() => {
          if (st.phase === "scene3-idle" || st.phase === "transition-2-3") {
            showOnly(["scene3Loop"]);
            sources.scene3Loop.reset();
            sources.scene3Loop.play(true);
            st.scene3LoopStarted = true;
          }
        });

        runLater(() => {
          setPhase("scene3-idle");
          unlock();
          st.scene2SkipStarted = false;
          resetScene2Exit({ clearTimer: false });
          emitSceneChange(3);
        }, shift + 40);
      };

      if (o.fromScene2Exit) start();
      else runLater(start, canSkipIntro ? 120 : 800);
    }

    // 3 → 2
    function goBackToScene2(): void {
      if (st.locked || st.phase !== "scene3-idle") return;
      lock();
      setPhase("transition-3-2");
      resetScene2Exit();

      const shift = Math.max(CONFIG.minSceneShiftMs, transitionMs());
      runLater(() => {
        sources.scene3Loop.pause();
        sources.scene3.pause();
        showOnly(["scene2Idle"]);
        sources.scene2Idle.reset();
        sources.scene2Idle.play(true);
        moveTo(1, shift);
        runLater(() => {
          setPhase("scene2-idle");
          unlock();
          emitSceneChange(2);
        }, shift + 40);
      }, 800);
    }

    // 3 → 4
    function goScene4(): void {
      if (st.locked || st.phase !== "scene3-idle") return;
      lock();
      setPhase("transition-3-4");
      moveTo(3, CONFIG.sceneShiftFarMs);
      runLater(() => {
        setPhase("scene4-idle");
        setProgressPct(100);
        unlock();
        emitSceneChange(4);
      }, CONFIG.sceneShiftFarMs + 40);
    }

    // 4 → 3
    function goBackToScene3(): void {
      if (st.locked || st.phase !== "scene4-idle") return;
      lock();
      setPhase("transition-4-3");
      moveTo(2, CONFIG.sceneShiftFarMs);
      runLater(() => {
        setPhase("scene3-idle");
        unlock();
        emitSceneChange(3);
      }, CONFIG.sceneShiftFarMs + 40);
    }

    // → 1
    function goScene1(opts?: { force?: boolean }): void {
      const o = opts || {};
      if (!o.force && (st.locked || st.phase === "transition")) return;
      lock();
      st.scene2IdleStarted = true;
      st.scene2SkipStarted = false;
      resetScene2Exit();
      resetProgress();

      showOnly(["scene1"]);
      sources.scene1.reset();
      sources.scene1.play(true);
      moveTo(0, CONFIG.sceneShiftMs);

      runLater(() => {
        setPhase("scene1-idle");
        unlock();
        emitSceneChange(1);
      }, CONFIG.sceneShiftMs + 40);
    }

    // scene2 播放中途跳过
    function skipScene2AndGoScene3(): void {
      if (st.phase !== "scene2-intro" || st.scene2SkipStarted) return;
      startScene2ExitToScene3({ skipScene2Intro: true });
    }
    function skipScene2AndGoScene1(): void {
      if (st.phase !== "scene2-intro" || st.scene2SkipStarted) return;
      st.scene2SkipStarted = true;
      sources.scene2.pause();
      goScene1({ force: true });
    }

    /* ================= 导航入口 ================= */

    function canNavigate(): boolean {
      if (st.locked || st.introActive) return false;
      if (st.isScene2Leaving) return false;
      if (st.detailOpen) return false;
      return true;
    }

    function navigate(dir: "next" | "prev"): void {
      if (!canNavigate()) return;
      if (dir === "next") {
        if (st.phase === "scene1-idle") goScene2();
        else if (st.phase === "scene2-intro") skipScene2AndGoScene3();
        else if (st.phase === "scene2-idle") startScene2ExitToScene3();
        else if (st.phase === "scene3-idle") goScene4();
      } else {
        if (st.phase === "scene4-idle") goBackToScene3();
        else if (st.phase === "scene3-idle") goBackToScene2();
        else if (st.phase === "scene2-intro") skipScene2AndGoScene1();
        else if (st.phase === "scene2-idle") goScene1();
      }
    }

    /** 导航点跳转（照抄 script.js:482-491 的受限逻辑：不是所有目标都能直达） */
    function goToScene(n: 1 | 2 | 3 | 4): void {
      if (st.locked || st.introActive) return;
      if (n === 1) goScene1();
      else if (n === 2) {
        if (st.scene > 2) goBackToScene2();
        else goScene2();
      } else if (n === 3) {
        if (st.scene === 4) goBackToScene3();
        else if (st.scene < 3) goScene3();
      } else if (n === 4) {
        if (st.scene < 4) goScene4();
      }
    }

    function setDetailOpen(open: boolean): void {
      st.detailOpen = open;
      setDetailOpenReact(open);
      const scope = scopeRef.current;
      if (!scope) return;
      if (open) scope.dataset.detailOpen = "";
      else delete scope.dataset.detailOpen;
    }

    /* ================= 入场层 ================= */

    function enterSite(): void {
      if (!st.introActive) return;
      st.introActive = false;
      setIntroActiveReact(false);
      // 音频起播（必须在这个用户手势里）与 900ms 隐藏由 IntroOverlay 处理，阶段 5 接 AudioControl
    }

    /* ================= 进度条 rAF ================= */

    /* ⚠️ 这里修掉了原版的一个瑕疵（对照表 N-07）。
       原版 `script.js:455` 是无条件 `requestAnimationFrame(frameLoop)` ——
       10 个 phase 里只有 transition 和 scene2-intro 会让它做事，其余 8 个都在空转。
       PROJECT_SPEC 自己把这条列为「已知未修的小瑕疵」。

       改法：只在这两个 phase 跑，其余停链。`setPhase()` 负责在新 phase 需要时重新启动。
       链是否会自然断掉的关键在 `enterScene2Idle()` —— 它把 phase 切成 scene2-idle，
       于是本帧结束后不再续帧。**尾帧接管判定依赖这个循环，别把这里的判断改宽或改窄。** */

    function needsFrameLoop(): boolean {
      return st.phase === "transition" || st.phase === "scene2-intro";
    }

    function startFrameLoop(): void {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(frameTick);
    }

    function frameTick(): void {
      rafId = null;
      if (st.phase === "transition") {
        const t = sources.transition;
        setProgressPct(Math.min(1, t.getProgress()) * 100);
      } else if (st.phase === "scene2-intro") {
        const s2 = sources.scene2;
        const p = s2.getProgress();
        setProgressPct(Math.min(1, p) * 100);
        // 结束前 tailHandoverSec 交给尾帧循环
        const remain = (1 - p) * (s2.durationMs / 1000);
        if (remain <= CONFIG.tailHandoverSec) enterScene2Idle();
      }
      if (needsFrameLoop()) rafId = requestAnimationFrame(frameTick);
    }

    /* ================= 副作用挂载 ================= */

    // 视口高度（移动端地址栏问题）
    updateAppHeight();
    window.addEventListener("resize", updateAppHeight);
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", updateAppHeight);
      window.visualViewport.addEventListener("scroll", updateAppHeight);
    }

    // 标签页隐藏时省电（只暂停视频源）
    const onVisibilityChange = () => {
      Object.keys(sources).forEach((k) => {
        const s = sources[k];
        if (!isVideoSource(s)) return;
        if (document.hidden) s.pause();
        else if (s === sources[currentSourceKey()]) s.play(false);
      });
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    // 背景源时长同步（真实 metadata 到了以后以它为准）
    const offSourceReady = bus.on(EVT.sourceReady, (d) => {
      const detail = d as { key?: string; durationMs?: number } | undefined;
      if (detail && detail.key === "transition" && typeof detail.durationMs === "number") {
        document.documentElement.style.setProperty(
          "--transition-ms",
          Math.max(1200, detail.durationMs) + "ms",
        );
      }
    });

    /* ================= 启动（照抄 script.js:562-567） ================= */

    document.documentElement.style.setProperty("--transition-ms", transitionMs() + "ms");
    // setPhase 内部会按需要启动进度条 rAF；scene1-idle 不需要，所以这里不再单独调 frameLoop
    setPhase("scene1-idle");
    showOnly(["scene1"]);
    sources.scene1.play(true);

    setApi({
      navigate,
      goToScene,
      goHome: () => goScene1(),
      enterSite,
      setDetailOpen,
      state: st,
      sources,
    });

    /* ================= 清理 ================= */

    return () => {
      disposed = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
      window.removeEventListener("resize", updateAppHeight);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", updateAppHeight);
        window.visualViewport.removeEventListener("scroll", updateAppHeight);
      }
      document.removeEventListener("visibilitychange", onVisibilityChange);
      offSourceReady();
      Object.keys(sources).forEach((k) => sources[k].dispose());

      /* 清掉写在 documentElement 上的三个运行时变量 —— 它们是我们带进全局的，
         离开时该带走。C-BLOG 其他页面本来就不用这三个名字（已核对 index.css 的
         100+ 个变量），所以留着的实际危害是零；但无人认领的全局状态就是债。 */
      const rootStyle = document.documentElement.style;
      rootStyle.removeProperty("--app-height");
      rootStyle.removeProperty("--scene-index");
      rootStyle.removeProperty("--transition-ms");

      setApi(null);
    };
  }, [scopeRef, stageRef, trackRef]);

  return {
    phase,
    scene,
    sourceLabel,
    introActive,
    detailOpen,
    scene2Leaving,
    dataPhase,
    api,
    progressBarRef,
  };
}

export default useSceneMachine;
