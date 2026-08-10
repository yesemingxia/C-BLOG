// @cuiruoni+网站背景设置的本地存储与跨组件事件
// @cuiruoni+图片数据只存浏览器 localStorage，服务器只留存配置信息（见 backgroundApi）

export interface BackgroundSetting {
  type: "none" | "image" | "style";
  style_id?: string;
  /** dataURL：本地上传的原图或 AI 生成图（下载后转存），仅存本机 */
  source?: string;
  /** 服务器上的生成图相对路径（/api/styles/file/xxx），仅当使用服务器图时存在 */
  image_url?: string;
}

const STORAGE_KEY = "blog_background";
export const BACKGROUND_CHANGE_EVENT = "blog-background-change";

export function loadBackground(): BackgroundSetting | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BackgroundSetting;
    if (!parsed || parsed.type === "none") return null;
    return parsed;
  } catch {
    return null;
  }
}

/** 保存背景设置，返回是否成功（localStorage 配额超限时返回 false） */
export function saveBackground(setting: BackgroundSetting): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(setting));
    window.dispatchEvent(new Event(BACKGROUND_CHANGE_EVENT));
    return true;
  } catch {
    return false;
  }
}

export function clearBackground() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(BACKGROUND_CHANGE_EVENT));
}

/** 校验背景图地址协议，防止任意协议/注入破坏 CSS */
function isSafeImageUrl(url: string): boolean {
  return (
    url.startsWith("data:image/") ||
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("/api/styles/file/")
  );
}

/** 解析出可渲染的背景图地址（优先服务器图，其次本地 dataURL）；非法地址返回 null */
export function backgroundImage(setting: BackgroundSetting | null): string | null {
  if (!setting || setting.type === "none") return null;
  const img = setting.image_url || setting.source || null;
  if (!img || !isSafeImageUrl(img)) return null;
  return img;
}

/** 把 URL（含 /api/styles/file/xxx）拉取为 dataURL，用于完全本地留存 */
export async function urlToDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`下载图片失败: ${res.status}`);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("读取图片失败"));
    reader.readAsDataURL(blob);
  });
}
