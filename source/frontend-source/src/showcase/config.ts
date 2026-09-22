/* config.ts — 全局常量与个性化配置
 *
 * 迁移自 person/config.js。逻辑原样，只做三件事：
 *   1. IIFE + window.SCENE_CONFIG → `export const CONFIG`
 *   2. `global.innerWidth` → `window.innerWidth`
 *   3. 资源路径改为 Vite public 目录 (`/showcase/assets/...`)
 *
 * ⚠️ spectrum 的 barCount / barSpacing / maxWidth 依赖 innerWidth，在**模块加载时求值**——
 *    这是原版行为（resize 后不重算），保持一致，不要"顺手修好"。
 */

export type MediaMode = 'auto' | 'video' | 'procedural';

export interface Persona {
  brand: string;
  nickname: string;
  tagline: string;
  location: string;
  focus: string;
  email: string;
  github: string;
  douyin: string;
}

export interface SpectrumConfig {
  fftSize: number;
  barCount: number;
  barWidth: number;
  barSpacing: number;
  maxWidth: number;
  layout: string;
  sensitivity: number;
  opacity: number;
  smoothingTimeConstant: number;
}

export interface AudioConfig {
  enabled: boolean;
  src: string;
  defaultVolume: number;
  autoPlayOnEnter: boolean;
  loop: boolean;
  spectrum: SpectrumConfig;
}

export interface RippleConfig {
  maxRadius: number;
  speed: number;
  alpha: number;
  decay: number;
  life: number;
  throttle: number;
}

export interface ShowcaseConfig {
  persona: Persona;
  mediaMode: MediaMode;
  audio: AudioConfig;
  formspreeEndpoint: string;
  wheelThreshold: number;
  wheelThrottle: number;
  touchThreshold: number;
  touchThrottle: number;
  mobileBreakpoint: number;
  sceneShiftMs: number;
  sceneShiftFarMs: number;
  tailHandoverSec: number;
  scene2ExitDelay: number;
  minSceneShiftMs: number;
  videoTimeoutMs: number;
  photoSpeed: number;
  photoGap: number;
  photoHeight: number;
  ripple: RippleConfig;
}

const isMobileWidth = window.innerWidth < 768;

export const CONFIG: ShowcaseConfig = {
  /* ---- 个性化（对应 PROJECT_SPEC §11 占位符） ---- */
  persona: {
    brand: 'PORTFOLIO / STUDIO',
    nickname: '你的昵称',
    tagline: '一句签名，说明你是谁、在做什么。',
    location: '长沙',
    focus: 'Web · AI · Visual',
    email: 'hello@example.com',
    github: 'your-github',
    douyin: 'your-douyin',
  },

  /* ---- 背景媒体模式 ----
   * 'auto'       有视频就用视频，加载失败自动回退到程序化背景（推荐）
   * 'video'      只用真实视频（缺文件就是黑屏，不会回退）
   * 'procedural' 只用程序化背景（不发任何媒体请求，省流量）
   *
   * 2026-09-21 起为 'auto'：六个背景视频已转码落到
   * `public/showcase/assets/`（71.4 MB → 约 18 MB，H.264 CRF25 + faststart + 去音轨）。
   * 选 'auto' 而不是 'video'，是为了保留三保险容错 ——
   * 视频缺失/解码失败/12s 拿不到 metadata 时自动回退程序化背景，页面不会黑屏。
   * 素材不入库（.gitignore 有 *.mp4），新克隆的仓库若没搬素材，会自动走程序化背景。
   */
  mediaMode: 'auto',

  /* ---- 音频 ----
   * ⚠️ `enabled: false` = **整块关闭**（频谱与面板都不创建）。这是原版自带的总开关 —
   *    `effects-init.js:36` 就是 `if (audioCfg.enabled && ...)`，不是迁移时新加的机制。
   *
   * 当前为什么关着：`background-music.mp3`（3.7 MB）按用户要求**暂不搬进**
   * `public/showcase/assets/`。按 L-06 的设计，音源不可用时面板本来就会整块隐藏 ——
   * 与其让它先渲染、再被 `error` 事件隐掉（会闪一下），不如直接用总开关关掉。
   *
   * 将来启用：把 mp3 放到 `public/showcase/assets/background-music.mp3`，
   * 把这个值改回 `true` 即可 —— 代码是完整的，不需要其他改动。
   */
  audio: {
    enabled: false,
    src: '/showcase/assets/background-music.mp3',
    defaultVolume: 0.5,
    autoPlayOnEnter: true, // 点「进入网站」时起播（浏览器策略要求先有用户交互）
    loop: true,
    spectrum: {
      fftSize: 256,
      barCount: isMobileWidth ? 18 : 24,
      barWidth: 3,
      barSpacing: isMobileWidth ? 3 : 4,
      maxWidth: isMobileWidth ? 120 : 190,
      layout: 'arc',
      sensitivity: 1.35,
      opacity: 0.85,
      smoothingTimeConstant: 0.78,
    },
  },

  /* ---- 表单 ---- */
  // 留空 = 本地模拟；填入形如 https://formspree.io/f/xxxx 即走真实提交
  formspreeEndpoint: '',

  /* ---- 交互阈值 ---- */
  wheelThreshold: 18,
  wheelThrottle: 700,
  touchThreshold: 60,
  touchThrottle: 680,
  mobileBreakpoint: 768,

  /* ---- 转场节奏 ---- */
  sceneShiftMs: 520, // 回到 scene1
  sceneShiftFarMs: 900, // 3↔4；2↔3 会取 max(该值, 背景源时长)
  tailHandoverSec: 1.02, // scene2 结束前多久交给尾帧循环
  scene2ExitDelay: 320, // scene2 离场动画时长（卡片上移淡出）
  minSceneShiftMs: 900,
  videoTimeoutMs: 12000, // 视频多久没拿到 metadata 就判定失败（auto 模式下回退）

  /* ---- 相册 ---- */
  photoSpeed: 0.3, // px / 帧
  photoGap: 30,
  photoHeight: 220,

  /* ---- 特效 ---- */
  ripple: { maxRadius: 80, speed: 1, alpha: 0.7, decay: 0.008, life: 140, throttle: 69 },
};

export default CONFIG;
