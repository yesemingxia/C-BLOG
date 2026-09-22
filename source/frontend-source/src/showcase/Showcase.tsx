/* Showcase.tsx — 场景滚动作品集（迁移自 D:\person）
 *
 * 阶段 1–6 全部完成（224/224，见 SHOWCASE_PHASE6_PLAN.md）：骨架与集成边界、
 * 状态机与输入路由、样式全量作用域化、四个场景的真实内容、特效、移动端控件。
 *
 * 后续两次改动：
 *   · 2026-09-21 背景视频接入 —— `CONFIG.mediaMode` 由 'procedural' 切 'auto'，
 *     六个 mp4 转码后落在 `public/showcase/assets/`。
 *   · 2026-09-21 场景 3 换功能 —— 由「3D 照片流」换成「Markdown 编辑器」
 *     （`components/SceneEditor.tsx`，功能迁移自 C-BLOG 的 `pages/Write.tsx`）。
 *     照片流那套（SceneGallery / usePhotoFlow / Carousel / lib/photos）已停止渲染，
 *     文件保留以备切回。
 *
 * 三条集成边界（违反任何一条，后面做得再对也是坏的）：
 *   1. 不使用 MainLayout —— 它会注入 GlassBackground(Canvas 毛玻璃) + Navbar + pt-16，
 *      person 自带舞台与背景层，两套会叠加。
 *   2. 路由上不包 PageTransition —— 它的 motion.div 带 translateY 与 blur()，
 *      两者都创建 containing block，会让内部所有 fixed 元素相对该 div 定位，
 *      全屏舞台直接缩进内容区。需要转场就在 showcase 内部自己做。
 *   3. 不引入 window.SSP —— 用本目录内的模块与 React state 替代。
 *
 * 另：`.ssp-scope` 根元素上永远不要加 transform / filter / perspective /
 * contain / will-change / backdrop-filter，理由同第 2 条。详见 showcase.css 顶部注释。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "../styles/showcase.css";
/* 场景 3 编辑器样式：showcase 独有新增，按 showcase.css 头部的约定单独成文件，
   不参与 scope-css.cjs 的作用域化生成（重新生成 showcase.css 不会覆盖它）。 */
import "../styles/showcase-editor.css";
// 场景 2 文章卡片 + 站内阅读弹窗
import "../styles/showcase-posts.css";
// 翻页控件的按下动效（导航点 / 移动端 Prev·Next / 首页进入按钮 / 顶栏文章入口）
import "../styles/showcase-controls.css";
// @cuiruoni+showcase 独有新增：通往博客的入口样式（Topbar 链接 + 入场层直达链接）
import "../styles/showcase-entry.css";
import { useSceneMachine } from "./lib/useSceneMachine";
import { useWheelNavigation } from "./lib/useWheelNavigation";
import { applySceneVideoOverride } from "./sceneSources";
import { videosApi } from "../lib/api";
import type { Project } from "./lib/projects";
import type { ApiPost } from "../lib/api";
import PostModal from "./components/PostModal";
import Topbar from "./components/Topbar";
import PullToLogin from "./components/PullToLogin";
import MobileSceneControls from "./components/MobileSceneControls";
import ProgressUI from "./components/ProgressUI";
import IntroOverlay from "./components/IntroOverlay";
import SceneHome from "./components/SceneHome";
import SceneWork from "./components/SceneWork";
import SceneEditor from "./components/SceneEditor";
import SceneContact from "./components/SceneContact";
import ProjectModal from "./components/ProjectModal";
import { CONFIG } from "./config";
import WaterRipple from "./effects/WaterRipple";
import AudioSpectrum, { type SpectrumApi } from "./effects/AudioSpectrum";
import AudioControl, { type AudioControlApi } from "./effects/AudioControl";

/** 与 sceneSources.ts 的 key 一一对应；六个层必须全部存在，
 *  否则 BackgroundSource.createSources() 会 warn「缺少程序化背景层容器」 */
const BG_SOURCES = ["scene1", "transition", "scene2", "scene2Idle", "scene3", "scene3Loop"] as const;

/** 4 个场景的顺序即场景序号，与 .content-track 的 400vw 一一对应 */

const Showcase = () => {
  const scopeRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);

  /* ---------- 用户投稿背景（单一启用）----------
     进站同步：读缓存的当前背景视频并替换场景 1（在 createSources 之前生效）。
     异步：拉最新启用状态写回缓存 —— 本次播放的是上次的结果，无初始化竞态。
     没有启用的视频时回退默认背景。页面上永远只有一个背景视频。 */
  try {
    const cached = sessionStorage.getItem("ssp-bg-video");
    if (cached) applySceneVideoOverride("scene1", cached);
    else sessionStorage.removeItem("ssp-bg-video");
  } catch { /* 隐私模式等场景下静默失败 */ }

  useEffect(() => {
    let alive = true;
    videosApi
      .active()
      .then((video) => {
        if (!alive) return;
        try {
          if (video?.url) sessionStorage.setItem("ssp-bg-video", video.url);
          else sessionStorage.removeItem("ssp-bg-video");
        } catch { /* 忽略 */ }
      })
      .catch(() => { /* 拉不到就继续用默认/缓存背景 */ });
    return () => {
      alive = false;
    };
  }, []);

  const { scene, sourceLabel, introActive, scene2Leaving, dataPhase, api, progressBarRef } =
    useSceneMachine({ scopeRef, stageRef, trackRef });

  useWheelNavigation(api);

  /* 注：原来的照片流（usePhotoFlow + PHOTOS）曾提升到这一层，因为轮播渲染在 portal 层、
     需要在打开时 pause / 关闭时 resume。场景 3 换成 Markdown 编辑器后，
     轮播与照片流一并停用，这个提升也就没有了。 */

  /* body 级副作用：原 styles.css 的 `body { margin:0; overflow:hidden; background }`
     与移动端 `html,body { position:fixed }` 需要作用到真实 body 上，
     但包不进 .ssp-scope（会变成永不匹配的后代选择器）。
     用类名开关隔离，卸载时移除 —— C-BLOG 其他页面完全不受影响。 */
  useEffect(() => {
    document.body.classList.add("ssp-active");
    return () => {
      document.body.classList.remove("ssp-active");
    };
  }, []);

  /* portal 落点（第二个 .ssp-scope）：弹窗与轮播挂这里。
     用 state 存节点而不是 ref —— 首次渲染时 ref.current 还是 null，
     而 createPortal 需要一个已挂载的真实节点。 */
  const [overlayRoot, setOverlayRoot] = useState<HTMLDivElement | null>(null);

  /* 移动端 Prev/Next：与滚轮、键盘走**同一条 navigate 路径** ——
     locked / introActive / detailOpen 的拦截自动生效，不需要另写判断。 */
  const goPrev = useCallback(() => api?.navigate("prev"), [api]);
  const goNext = useCallback(() => api?.navigate("next"), [api]);

  /* ---------------- 音频（M-03 频谱挂载 / M-04 面板挂载 / A-05 起播） ----------------
    原版由 `effects-init.js` 统一创建：频谱挂 `#videoStage`、面板挂 `.site-shell`。
     总开关是 `CONFIG.audio.enabled` —— false 时两者都不创建，这正是原版
     `effects-init.js:36` 的 `if (audioCfg.enabled && ...)`，不是迁移时新加的机制。 */
  const [spectrum, setSpectrum] = useState<SpectrumApi | null>(null);
  const audioRef = useRef<AudioControlApi | null>(null);

  /* 这两个回调必须稳定引用：它们进了子组件的 useEffect 依赖数组 */
  const handleSpectrumReady = useCallback((s: SpectrumApi | null) => setSpectrum(s), []);
  const handleAudioReady = useCallback((a: AudioControlApi | null) => {
    audioRef.current = a;
  }, []);

  /* 入场起播（A-05，对应 script.js:469-475）。
     ⚠️ 必须是「进入网站」按钮用户手势的同步调用链 —— 浏览器自动播放策略的要求。
     写成 useEffect 里自动 play 只会静默失败，换不来任何体验。 */
  const handleEnterSite = useCallback(() => {
    // @cuiruoni+记录本会话已进站：登录/返回首页再进来时跳过入场层（见 useSceneMachine）
    try {
      sessionStorage.setItem("ssp-intro-done", "1");
    } catch { /* 隐私模式等场景下静默失败 */ }
    const audio = audioRef.current;
    if (audio && CONFIG.audio.autoPlayOnEnter !== false) {
      try {
        void audio.play().catch(() => {});
      } catch (err) {
        console.warn("[audio]", (err as Error).message);
      }
    }
    api?.enterSite();
  }, [api]);

  /* 「跳过展示，直接看文章」：先正常进站，再跳到场景 2。
     ⚠️ 不能点完就立刻 goToScene —— 入场层还在（introActive=true），
     canNavigate() 会把它拦掉。所以挂一个 pendingScene，等 introActive 落下再跳。 */
  const [pendingScene, setPendingScene] = useState<2 | null>(null);

  const handleSkipToArticles = useCallback(() => {
    handleEnterSite();
    setPendingScene(2);
  }, [handleEnterSite]);

  useEffect(() => {
    if (pendingScene === null || introActive) return;
    api?.goToScene(pendingScene);
    setPendingScene(null);
  }, [pendingScene, introActive, api]);

  /* ---------------- 场景 3 编辑器的发布面板 ----------------
     面板是全屏 fixed 遮罩，portal 到 overlay 层（否则轨道的 transform 会让它错位）。
     打开期间要屏蔽场景导航 —— 与项目详情弹窗走同一条 `detailOpen` 通路：
     `canNavigate()` 会因此返回 false，滚轮 / 触摸 / 键盘都翻不动场景。 */
  const handlePublishPanelToggle = useCallback(
    (open: boolean) => api?.setDetailOpen(open),
    [api],
  );

  /* ---------------- 场景 2：文章阅读弹窗 ----------------
     与项目详情弹窗同一套机制：portal 到 overlay 层 + 打开期间屏蔽场景导航。 */
  const [activePost, setActivePost] = useState<ApiPost | null>(null);

  const openPost = useCallback(
    (p: ApiPost) => {
      setActivePost(p);
      api?.setDetailOpen(true);
    },
    [api],
  );

  const closePost = useCallback(() => {
    setActivePost(null);
    api?.setDetailOpen(false);
  }, [api]);

  /* 场景 3 发布成功后 +1 → 场景 2 重新拉列表，新文章立刻出现在这一屏 */
  const [postsRefreshToken, setPostsRefreshToken] = useState(0);
  const handlePublished = useCallback(() => setPostsRefreshToken((n) => n + 1), []);

  /* ---------------- 项目详情弹窗 ---------------- */
  const [activeProject, setActiveProject] = useState<Project | null>(null);

  const openProject = useCallback(
    (p: Project) => {
      setActiveProject(p);
      // 通知状态机：弹窗打开期间屏蔽场景导航，并给 .ssp-scope 加 data-detail-open
      api?.setDetailOpen(true);
    },
    [api],
  );

  const closeProject = useCallback(() => {
    setActiveProject(null);
    api?.setDetailOpen(false);
  }, [api]);

  return (
    <>
      <div className="ssp-scope" ref={scopeRef} data-phase="scene1">
        <main className="site-shell" aria-label="场景滚动式个人网站">
          {/* ---------- 背景舞台：6 个程序化背景层 + 氛围层 ---------- */}
          <div className="video-stage" id="videoStage" ref={stageRef}>
            {BG_SOURCES.map((key) => (
              <div key={key} className={"bg-source bg-" + key.toLowerCase()} data-source={key} />
            ))}
            <div className="cinema-vignette" aria-hidden="true" />
            <div className="grain" aria-hidden="true" />
            {/* 水波纹：组件内部渲染 #fxCanvas。
                它必须留在 #videoStage 内 —— 波纹监听的是 canvas.parentElement，
                移出舞台鼠标轨迹就不产生波纹了。 */}
            <WaterRipple dataPhase={dataPhase} />

            {/* 音频频谱（M-03）：canvas 由 AudioSpectrum 自己 append 到 #videoStage，
                组件本身返回 null —— 写在这里只是标明它逻辑上属于舞台。
                `audio.enabled` 为 false 时整块不创建（原版 effects-init.js:36）。 */}
            {CONFIG.audio.enabled && (
              <AudioSpectrum
                stageRef={stageRef}
                dataPhase={dataPhase}
                onReady={handleSpectrumReady}
              />
            )}
          </div>

          {/* ---------- 顶栏 ---------- */}
          <Topbar scene={scene} onGoScene={(n) => api?.goToScene(n)} />

          {/* @cuiruoni+顶部「下拉进入登录」手势区：半透明向下箭头，按住下拖
              超过阈值跳 /login。fixed 定位，必须在 .content-track 外面
              （理由同 MobileSceneControls）。入场层覆盖期间被其遮挡，不影响。 */}
          <PullToLogin />

          {/* ---------- 移动端 Prev / Next（≤768px 才显示）----------
              必须在 .content-track **外面**：它是 position:fixed，而轨道带 transform
              （transform 会让内部 fixed 退化成 absolute，按钮位置全错）。 */}
          <MobileSceneControls onPrev={goPrev} onNext={goNext} />

          {/* ---------- 音频控制面板（M-04）----------
              挂 .site-shell（原版 effects-init.js:44 的 mount），随入场层一起被遮住。
              同样是 position:fixed，所以也在 .content-track 外面。 */}
          {CONFIG.audio.enabled && (
            <AudioControl spectrum={spectrum} onReady={handleAudioReady} />
          )}

          {/* ---------- 场景轨道：4 × 100vw，顺序即场景序号 ---------- */}
          <div className="content-track" id="contentTrack" ref={trackRef} style={{ width: "400vw" }}>
            <SceneHome onEnter={() => api?.goToScene(2)} />
            <SceneWork
              leaving={scene2Leaving}
              refreshToken={postsRefreshToken}
              onOpenPost={openPost}
            />
            <SceneEditor
              portalRoot={overlayRoot}
              onPublishPanelToggle={handlePublishPanelToggle}
              onPublished={handlePublished}
            />
            <SceneContact />
          </div>

          {/* ---------- 进度与状态 UI ---------- */}
          <ProgressUI sourceLabel={sourceLabel} progressBarRef={progressBarRef} />

          {/* ---------- 入场层 ---------- */}
          <IntroOverlay active={introActive} onEnter={handleEnterSite} onSkip={handleSkipToArticles} />
        </main>
      </div>

      {/* ---------- portal 专用层：空的一层，只做落点 ---------- */}
      <div className="ssp-scope ssp-portal-root" ref={setOverlayRoot} data-portal-root />

      {/* 项目详情弹窗：必须落在上面的 portal 层里。
          挂 .site-shell 内会被 .content-track 的 transform 影响 fixed；
          挂 document.body 会脱离 .ssp-scope 丢掉全部样式。 */}
      {overlayRoot &&
        createPortal(
          <>
            <ProjectModal project={activeProject} onClose={closeProject} />
            <PostModal post={activePost} onClose={closePost} />
          </>,
          overlayRoot,
        )}
    </>
  );
};

export default Showcase;
