/* BackgroundSource.ts — 可插拔背景源
 *
 * 迁移自 person/background-source.js。**统一接口一个字节都没有改**，只加 TS 类型。
 *
 * 统一接口（编排层只认这个，不认 <video>）：
 *   key | durationMs | getProgress() | play(fromStart) | pause() | reset()
 *   setVisible(bool) | whenComplete(cb) | dispose()
 *
 * 三套实现：
 *   ProceduralBackgroundSource —— 无素材时的程序化背景（CSS 合成层 + JS 时钟）
 *   VideoBackgroundSource      —— 真实 <video>
 *   AutoBackgroundSource       —— 先试视频，失败自动切程序化（默认）
 *
 * 容错是「三保险」，不要重写：
 *   1. video 的 `ended` 事件
 *   2. whenComplete 里 durationMs + 700ms 的超时兜底（部分是移动端不发 ended）
 *   3. 构造时 videoTimeoutMs(12s) 内没拿到 metadata 就判失败 → 回退程序化
 */

import { bus, EVT } from './bus';
import { CONFIG } from '../config';
import { SCENE_SOURCES, type SceneSourceDecl, type SourceImpl } from '../sceneSources';

const VIDEO_TIMEOUT = CONFIG.videoTimeoutMs || 12000;

export type CompleteCb = (src: SceneSource) => void;

/** 编排层看到的统一形状（三个实现都满足） */
export interface SceneSource {
  key: string;
  /** Video/Procedural 是实现名；Auto 包一层时这里是子实例 */
  impl: string | SceneSource;
  label: string;
  loop: boolean;
  durationMs: number;
  play(fromStart?: boolean): void;
  pause(): void;
  reset(): void;
  getProgress(): number;
  setVisible(v: boolean): void;
  whenComplete(cb: CompleteCb): void;
  dispose(): void;
}

function emit(name: string, detail: unknown): void {
  bus.emit(name, detail);
}

/* ---------------- 程序化源 ---------------- */
export class ProceduralBackgroundSource implements SceneSource {
  readonly key: string;
  readonly impl = 'procedural';
  el: HTMLElement | null;
  loop: boolean;
  durationMs: number;
  label: string;
  visible = false;

  private _start = 0;
  private _playing = false;
  private _done = false;
  private _timer: ReturnType<typeof setTimeout> | null = null;
  private _cbs: CompleteCb[] = [];

  constructor(el: HTMLElement | null, cfg: SceneSourceDecl) {
    this.key = cfg.key;
    this.el = el;
    this.loop = !!cfg.loop;
    this.durationMs = cfg.durationMs || 0;
    this.label = cfg.label || cfg.key;
  }

  private _clearTimer(): void {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  private _fire(): void {
    this._done = true;
    const list = this._cbs.slice();
    this._cbs.length = 0;
    for (const cb of list) {
      try {
        cb(this);
      } catch (e) {
        console.error('[source] complete cb error', e);
      }
    }
  }

  play(fromStart?: boolean): void {
    if (fromStart !== false) {
      this._start = performance.now();
      this._done = false;
    } else if (!this._start) {
      this._start = performance.now();
    }
    this._playing = true;
    this._clearTimer();

    // 重启 CSS 动画，让每次播放都从 0 开始
    const el = this.el;
    if (el) {
      el.classList.remove('is-running');
      void el.offsetWidth;
      el.classList.add('is-running');
    }

    if (!this.loop && this.durationMs > 0) {
      const remain = Math.max(0, this.durationMs - (performance.now() - this._start));
      this._timer = setTimeout(() => {
        this._playing = false;
        this._fire();
      }, remain);
    }
  }

  pause(): void {
    this._playing = false;
    this._clearTimer();
  }

  reset(): void {
    this.pause();
    this._start = 0;
    this._done = false;
    this._cbs.length = 0;
  }

  getProgress(): number {
    if (this._done) return 1;
    if (!this._playing || !this.durationMs) return 0;
    return Math.min(1, (performance.now() - this._start) / this.durationMs);
  }

  setVisible(v: boolean): void {
    this.visible = !!v;
    if (this.el) this.el.classList.toggle('is-visible', !!v);
  }

  whenComplete(cb: CompleteCb): void {
    this._cbs.push(cb);
  }

  dispose(): void {
    this.pause();
    this._cbs.length = 0;
  }
}

/* ---------------- 视频源 ---------------- */
export class VideoBackgroundSource implements SceneSource {
  readonly key: string;
  readonly impl = 'video';
  loop: boolean;
  label: string;
  durationMs: number;
  el: HTMLVideoElement;

  /** AutoBackgroundSource 挂载 */
  onFail: ((src: VideoBackgroundSource) => void) | null = null;
  onReady: ((src: VideoBackgroundSource) => void) | null = null;

  private _cbs: CompleteCb[] = [];
  private _done = false;
  private _failed = false;
  private _timeout: ReturnType<typeof setTimeout> | null = null;
  /** 计时器引用（原版没存，dispose 时清不掉；这里存下来以便正确清理） */
  private _completeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(parent: HTMLElement, cfg: SceneSourceDecl) {
    this.key = cfg.key;
    this.loop = !!cfg.loop;
    this.label = cfg.label || cfg.key;
    this.durationMs = cfg.durationMs || 0;

    const v = document.createElement('video');
    v.className = 'bg-video';
    v.src = cfg.videoSrc || '';
    v.muted = true;
    v.defaultMuted = true;
    v.playsInline = true;
    v.setAttribute('playsinline', '');
    v.setAttribute('webkit-playsinline', '');
    v.preload = 'auto';
    v.loop = this.loop;
    v.style.zIndex = String(cfg.zIndex == null ? 0 : cfg.zIndex);
    if (cfg.poster) v.style.background = cfg.poster;
    parent.appendChild(v);
    this.el = v;

    v.addEventListener('loadedmetadata', () => {
      if (Number.isFinite(v.duration) && v.duration > 0) this.durationMs = v.duration * 1000;
      if (this.onReady) this.onReady(this);
      emit(EVT.sourceReady, { key: this.key, durationMs: this.durationMs });
    });

    v.addEventListener('ended', () => this._fire());

    // 缺文件 / 解码失败 / 超时 → 交给上层回退
    v.addEventListener('error', () => this._fail('error'));
    this._timeout = setTimeout(() => {
      if (!this._ready()) this._fail('timeout');
    }, VIDEO_TIMEOUT);
  }

  private _ready(): boolean {
    return this.el.readyState >= 1 && Number.isFinite(this.el.duration) && this.el.duration > 0;
  }

  private _fail(reason: string): void {
    if (this._failed) return;
    this._failed = true;
    this._clearTimeout();
    console.warn('[source] 视频不可用，回退程序化背景:', this.key, reason);
    emit(EVT.sourceFallback, { key: this.key, reason });
    if (this.onFail) this.onFail(this);
  }

  private _clearTimeout(): void {
    if (this._timeout) {
      clearTimeout(this._timeout);
      this._timeout = null;
    }
  }

  play(fromStart?: boolean): void {
    if (this._failed) return;
    if (fromStart !== false) {
      try {
        this.el.currentTime = 0;
      } catch {
        /* 忽略：metadata 未就绪时设置 currentTime 会抛 */
      }
    }
    const p = this.el.play();
    if (p && p.catch) p.catch(() => {});
  }

  pause(): void {
    try {
      this.el.pause();
    } catch {
      /* 忽略 */
    }
  }

  reset(): void {
    this.pause();
    this._done = false;
    try {
      this.el.currentTime = 0;
    } catch {
      /* 忽略 */
    }
    this._cbs.length = 0;
  }

  getProgress(): number {
    if (!this.el.duration) return 0;
    return Math.min(1, this.el.currentTime / this.el.duration);
  }

  setVisible(v: boolean): void {
    this.el.classList.toggle('is-visible', !!v);
    if (!v) this.pause();
  }

  whenComplete(cb: CompleteCb): void {
    this._cbs.push(cb);
    if (!this.loop && this.durationMs > 0) {
      // 双保险：ended 事件可能不来（部分移动端浏览器），超时兜底
      const ms = this.durationMs + 700;
      this._completeTimer = setTimeout(() => {
        this._completeTimer = null;
        if (!this._done) this._fire();
      }, ms);
    }
  }

  private _fire(): void {
    if (this._done) return;
    this._done = true;
    this._clearTimeout();
    if (this._completeTimer) {
      clearTimeout(this._completeTimer);
      this._completeTimer = null;
    }
    const list = this._cbs.slice();
    this._cbs.length = 0;
    for (const cb of list) {
      try {
        cb(this);
      } catch (e) {
        console.error('[source] complete cb error', e);
      }
    }
  }

  dispose(): void {
    this.pause();
    this._clearTimeout();
    if (this._completeTimer) {
      clearTimeout(this._completeTimer);
      this._completeTimer = null;
    }
    this._cbs.length = 0;
  }
}

/* ---------------- 自动源：视频优先，失败回退 ---------------- */
export class AutoBackgroundSource implements SceneSource {
  readonly key: string;
  label: string;
  loop: boolean;
  durationMs: number;

  /** ⚠️ 这里是子实例而不是字符串，编排层的 isVideoSource() 依赖这个双层结构 */
  impl!: ProceduralBackgroundSource | VideoBackgroundSource;
  failed = false;

  private _cbs: CompleteCb[] = [];
  private _playing = false;
  private _visible = false;
  private _fromStart = true;

  constructor(
    stage: HTMLElement,
    cfg: SceneSourceDecl,
    layerEl: HTMLElement | null,
    forceProcedural?: boolean,
  ) {
    this.key = cfg.key;
    this.label = cfg.label || cfg.key;
    this.loop = !!cfg.loop;
    this.durationMs = cfg.durationMs || 0;

    if (forceProcedural || !cfg.videoSrc) {
      this._useProcedural(layerEl, cfg);
      return;
    }

    const v = new VideoBackgroundSource(stage, cfg);
    this.impl = v;
    v.onReady = (src) => {
      this.durationMs = src.durationMs;
      if (this._visible) this.setVisible(true);
      if (this._playing) src.play(this._fromStart);
    };
    v.onFail = () => {
      this.failed = true;
      v.dispose();
      if (v.el && v.el.parentNode) v.el.parentNode.removeChild(v.el);
      this._useProcedural(layerEl, cfg);
    };
  }

  private _useProcedural(layerEl: HTMLElement | null, cfg: SceneSourceDecl): void {
    let el = layerEl;
    if (!el) {
      el = document.createElement('div');
      el.className = 'bg-source bg-' + cfg.key.toLowerCase();
      el.setAttribute('data-source', cfg.key);
      document.getElementById('videoStage')?.appendChild(el);
    }
    const p = new ProceduralBackgroundSource(el, cfg);
    this.impl = p;
    if (this._visible) p.setVisible(true);
    if (this._playing) p.play(this._fromStart);
    // 程序化源的一次性 complete 也要能回调到上层
    if (!this.loop) p.whenComplete(() => this._fire());
  }

  private _fire(): void {
    const list = this._cbs.slice();
    this._cbs.length = 0;
    for (const cb of list) {
      try {
        cb(this);
      } catch (e) {
        console.error('[source] complete cb error', e);
      }
    }
  }

  play(fromStart?: boolean): void {
    this._playing = true;
    this._fromStart = fromStart !== false;
    this.impl.play(fromStart);
  }

  pause(): void {
    this._playing = false;
    this.impl.pause();
  }

  reset(): void {
    this.impl.reset();
    this._cbs.length = 0;
  }

  getProgress(): number {
    return this.impl.getProgress();
  }

  setVisible(v: boolean): void {
    this._visible = !!v;
    this.impl.setVisible(v);
  }

  whenComplete(cb: CompleteCb): void {
    this._cbs.push(cb);
    this.impl.whenComplete(() => this._fire());
  }

  dispose(): void {
    this.impl.dispose();
    this._cbs.length = 0;
  }
}

/* ---------------- 工厂 ---------------- */
export function createSources(stage: HTMLElement): Record<string, SceneSource> {
  const mode = (CONFIG.mediaMode || 'auto').toLowerCase();
  const map: Record<string, SceneSource> = {};

  Object.keys(SCENE_SOURCES).forEach((key) => {
    const cfg = SCENE_SOURCES[key];
    const layerEl = stage.querySelector<HTMLElement>(`[data-source="${key}"]`);
    if (!layerEl) console.warn('[source] 缺少程序化背景层容器:', key);

    let impl: SourceImpl = (cfg.impl || 'auto').toLowerCase() as SourceImpl;
    if (mode === 'procedural') impl = 'procedural';
    else if (mode === 'video') impl = 'video';

    if (impl === 'procedural') {
      map[key] = new ProceduralBackgroundSource(layerEl, cfg);
    } else if (impl === 'video') {
      map[key] = new VideoBackgroundSource(stage, cfg);
    } else {
      map[key] = new AutoBackgroundSource(stage, cfg, layerEl, false);
    }
  });

  return map;
}

/** 判断一个源当前是不是跑在 video 实现上（Auto 会包一层） */
export function isVideoSource(s: SceneSource | null | undefined): boolean {
  if (!s) return false;
  if (s.impl === 'video') return true;
  return typeof s.impl === 'object' && s.impl.impl === 'video';
}

export const BackgroundSource = {
  Procedural: ProceduralBackgroundSource,
  Video: VideoBackgroundSource,
  Auto: AutoBackgroundSource,
  create: createSources,
};

export default BackgroundSource;
