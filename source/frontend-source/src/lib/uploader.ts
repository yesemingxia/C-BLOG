// @cuiruoni+分片上传器：支持断点续传、进度回调、失败自动重试（指数退避）
// @cuiruoni+流程：init 创建会话 → 按 1MB 分片顺序 PUT（Content-Range）→ complete 提交生成任务
// @cuiruoni+断点恢复：localStorage 记录未完成的 upload_id，重新选择同一文件时续传

const CHUNK_SIZE = 1024 * 1024; // 1MB/片
const MAX_RETRIES = 3;
const RESUME_KEY_PREFIX = "blog_upload_";

export interface UploadProgress {
  loaded: number;
  total: number;
  percent: number; // 0-100
}

interface UploadInitResult {
  upload_id: string;
  received: number;
}

interface UploadQueryResult {
  upload_id: string;
  file_size: number;
  received: number;
  file_mime: string;
}

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    ...options,
  });
  const payload = (await res.json().catch(() => null)) as {
    code?: number;
    message?: string;
    data?: T;
  } | null;
  if (!res.ok || !payload || payload.code !== 0) {
    throw new Error(payload?.message || `请求失败 ${res.status}`);
  }
  return payload.data as T;
}

/** PUT 分片（xhr 以获得上传进度与中断控制） */
function xhrPut(
  url: string,
  blob: Blob,
  headers: Record<string, string>,
  signal: AbortSignal | undefined,
  onChunkProgress: (chunkLoaded: number) => void
): Promise<{ received: number }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.withCredentials = true;
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onChunkProgress(e.loaded);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error("上传响应解析失败"));
        }
      } else {
        reject(new Error(`上传失败 ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error("网络错误"));
    xhr.onabort = () => reject(new DOMException("已取消", "AbortError"));
    if (signal) {
      if (signal.aborted) {
        reject(new DOMException("已取消", "AbortError"));
        return;
      }
      signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }
    xhr.send(blob);
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 分片上传图片并提交风格生成任务
 * @param file 待上传图片（前端已压缩，≤10MB）
 * @param style 风格 ID（gathered / distillation）
 * @param onProgress 上传进度回调（0-100）
 * @param signal 取消信号
 * @returns 生成任务 task_id
 */
export async function uploadImage(
  file: File,
  style: string,
  onProgress: (p: UploadProgress) => void,
  signal?: AbortSignal
): Promise<string> {
  const total = file.size;

  // @cuiruoni+断点恢复：同尺寸同类型同修改时间的文件复用未完成的上传会话
  // @cuiruoni+（含 lastModified 防止"同尺寸同类型但内容不同"的文件混传旧分片）
  const resumeKey = RESUME_KEY_PREFIX + file.size + "_" + file.type + "_" + file.lastModified;
  let uploadId: string | null = localStorage.getItem(resumeKey);
  let received = 0;
  if (uploadId) {
    try {
      const q = await api<UploadQueryResult>(`/api/styles/upload/${uploadId}`);
      // @cuiruoni+会话已传满（如 complete 曾因队列满 503 失败）时保留会话，
      // @cuiruoni+上传循环将全部跳过，直接走 complete 续传——避免全量重传
      received = q.received;
    } catch {
      uploadId = null; // @cuiruoni+会话已过期，重新开始
    }
  }
  if (!uploadId) {
    const init = await api<UploadInitResult>("/api/styles/upload/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_size: file.size, file_mime: file.type }),
    });
    uploadId = init.upload_id;
    received = 0;
    localStorage.setItem(resumeKey, uploadId);
  }

  const chunks = Math.ceil(total / CHUNK_SIZE);
  for (let i = 0; i < chunks; i++) {
    if (signal?.aborted) throw new DOMException("已取消", "AbortError");
    const start = i * CHUNK_SIZE;
    if (start < received) continue; // @cuiruoni+跳过已接收分片（断点续传核心）
    const end = Math.min(start + CHUNK_SIZE, total) - 1;
    const blob = file.slice(start, end + 1);

    let done = false;
    for (let attempt = 0; attempt < MAX_RETRIES && !done; attempt++) {
      try {
        const r = await xhrPut(
          `/api/styles/upload/${uploadId}`,
          blob,
          { "Content-Range": `bytes ${start}-${end}/${total}` },
          signal,
          (chunkLoaded) => {
            // @cuiruoni+片内精确进度：已收 + 当前片内已传
            onProgress({
              loaded: Math.min(start + chunkLoaded, total),
              total,
              percent: Math.min(100, Math.round(((start + chunkLoaded) / total) * 100)),
            });
          }
        );
        received = Math.max(received, r.received);
        done = true;
      } catch (e) {
        if (signal?.aborted) throw e;
        if (attempt === MAX_RETRIES - 1) throw e;
        await sleep(800 * (attempt + 1)); // @cuiruoni+指数退避
        // @cuiruoni+重试前重新对齐断点（响应可能已丢失但服务端已接收）
        try {
          const q = await api<UploadQueryResult>(`/api/styles/upload/${uploadId}`);
          received = q.received;
          if (start < received) done = true; // @cuiruoni+当前片服务端已收，跳到下一片
        } catch {
          // @cuiruoni+会话过期由下一次 PUT 的 404 抛出，提示用户重新上传
        }
      }
    }
    onProgress({
      loaded: received,
      total,
      percent: Math.min(100, Math.round((received / total) * 100)),
    });
  }

  const completed = await api<{ task_id: string }>(`/api/styles/upload/${uploadId}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ style }),
  });
  // @cuiruoni+complete 成功后才清除断点记录；失败（如队列满 503）时保留，
  // @cuiruoni+用户稍后重试可直接续传已上传的分片
  localStorage.removeItem(resumeKey);
  return completed.task_id;
}
