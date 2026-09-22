/* sceneSources.ts — 背景源声明表（单一真相）
 *
 * 迁移自 person/scene-sources.js。轮换素材只需改这张表（含 durationMs），不用改状态机。
 *
 * impl: 'auto'（默认）→ 有视频用视频，失败自动回退程序化
 *       'video'      → 只用视频
 *       'procedural' → 只用程序化
 * 全局开关在 config.ts 的 mediaMode，'procedural' 时连请求都不发。
 *
 * durationMs 是「声明值」：视频没加载完之前用它顶上；拿到 metadata 后以真实时长为准。
 * 下面的数字来自 assets/ 里当前 mp4 的实测时长，换素材后不用改也能跑对。
 */

export type SourceImpl = 'auto' | 'video' | 'procedural';

export interface SceneSourceDecl {
  key: string;
  impl: SourceImpl;
  loop: boolean;
  durationMs: number;
  zIndex: number;
  label: string;
  videoSrc: string;
  poster: string;
}

export const SCENE_SOURCES: Record<string, SceneSourceDecl> = {
  scene1: {
    key: 'scene1',
    impl: 'auto',
    loop: true,
    durationMs: 17857,
    zIndex: 0,
    label: 'Scene 01 · Idle Loop',
    videoSrc: '/showcase/assets/scene1.mp4',
    poster: 'linear-gradient(140deg, #0B1620 0%, #07090C 100%)',
  },
  transition: {
    key: 'transition',
    impl: 'auto',
    loop: false,
    durationMs: 2973,
    zIndex: 20,
    label: 'Transition 01 → 02',
    videoSrc: '/showcase/assets/transition_1_2.mp4',
    poster: 'linear-gradient(120deg, #08131B 0%, #06080B 100%)',
  },
  scene2: {
    key: 'scene2',
    impl: 'auto',
    loop: false,
    durationMs: 18484,
    zIndex: 0,
    label: 'Scene 02 · Intro Playing',
    videoSrc: '/showcase/assets/scene2.mp4',
    poster: 'linear-gradient(160deg, #0A1218 0%, #06080B 100%)',
  },
  scene2Idle: {
    key: 'scene2Idle',
    impl: 'auto',
    loop: true,
    durationMs: 8011,
    zIndex: 0,
    label: 'Scene 02 · Last Second Loop',
    videoSrc: '/showcase/assets/scene2_idle_loop.mp4',
    poster: 'linear-gradient(160deg, #091017 0%, #06080B 100%)',
  },
  scene3: {
    key: 'scene3',
    impl: 'auto',
    loop: false,
    durationMs: 10380,
    zIndex: 0,
    label: 'Scene 03 · Editor Intro',
    videoSrc: '/showcase/assets/scene3.mp4',
    poster: 'linear-gradient(140deg, #0A1020 0%, #06070C 100%)',
  },
  scene3Loop: {
    key: 'scene3Loop',
    impl: 'auto',
    loop: true,
    durationMs: 7013,
    zIndex: 11,
    label: 'Scene 03 · Editor Loop',
    videoSrc: '/showcase/assets/scene3_loop.mp4',
    poster: 'linear-gradient(140deg, #090E1B 0%, #06070C 100%)',
  },
};

export default SCENE_SOURCES;

/**
 * @cuiruoni+视频投稿轮换池（方案 C）注入钩子：
 * 直接改写 SCENE_SOURCES 声明表的 videoSrc —— 只要在 `createSources()`
 * 之前调用（Showcase 挂载时同步读缓存），场景 1 的 idle 背景就换成
 * 轮换池里的用户投稿视频。object-fit: cover 让任意分辨率自适应裁剪，
 * 三保险容错（ended/超时/metadata 失败回退程序化背景）原样生效。
 */
export function applySceneVideoOverride(key: string, url: string): void {
  const cfg = SCENE_SOURCES[key];
  if (cfg && url) cfg.videoSrc = url;
}
