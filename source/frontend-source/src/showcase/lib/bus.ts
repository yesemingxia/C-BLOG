/* bus.ts — 事件总线
 *
 * 迁移自 person/bus.js，逻辑原样保留，只加类型。
 * 约定：事件名与 payload 与规格书一致
 *   scene:change / gallery:focus / gallery:wheel / source:ready / source:fallback
 *
 * on() 返回 off 函数，可直接作为 useEffect 的 cleanup。
 */

export type BusHandler<T = unknown> = (detail: T, evt: CustomEvent<T>) => void;

export class Bus {
  private map = new Map<string, Set<BusHandler<never>>>();

  on<T = unknown>(name: string, handler: BusHandler<T>): () => void {
    let set = this.map.get(name);
    if (!set) {
      set = new Set();
      this.map.set(name, set);
    }
    set.add(handler as BusHandler<never>);
    return () => this.off(name, handler);
  }

  off<T = unknown>(name: string, handler: BusHandler<T>): void {
    const set = this.map.get(name);
    if (set) set.delete(handler as BusHandler<never>);
  }

  emit<T = unknown>(name: string, detail?: T): void {
    const evt = new CustomEvent<T>(name, { detail: detail as T });
    // 兼容直接监听 window 的旧写法
    window.dispatchEvent(evt);

    const set = this.map.get(name);
    if (!set) return;
    set.forEach((fn) => {
      try {
        (fn as BusHandler<T>)(detail as T, evt);
      } catch (e) {
        console.error(`[bus] handler error on "${name}"`, e);
      }
    });
  }
}

export const bus = new Bus();

/** 事件名常量（避免全项目散落字符串字面量） */
export const EVT = {
  sceneChange: 'scene:change',
  galleryFocus: 'gallery:focus',
  galleryWheel: 'gallery:wheel',
  sourceReady: 'source:ready',
  sourceFallback: 'source:fallback',
} as const;

/** 事件 payload 类型 */
export interface SceneChangeDetail {
  scene: number;
  phase?: string;
}
export interface GalleryFocusDetail {
  photoId: number;
}
export interface GalleryWheelDetail {
  deltaY: number;
}
export interface SourceReadyDetail {
  key: string;
  durationMs: number;
}
export interface SourceFallbackDetail {
  key: string;
  reason: string;
}
