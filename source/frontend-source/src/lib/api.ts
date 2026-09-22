const API_BASE = "/api";
const REQUEST_TIMEOUT_MS = 8000;

export interface ApiPost {
  id: number;
  title: string;
  content?: string;
  content_md?: string;
  content_html?: string;
  excerpt?: string;
  summary?: string;
  cover?: string;
  author?: string;
  author_id?: number;
  user_id?: number;
  created_at?: string;
  updated_at?: string;
  status?: string;
  tags?: string[];
  likes?: number;
  like_count?: number;
  comment_count?: number;
  liked?: boolean;
  bookmarked?: boolean;
  comments_count?: number;
  views?: number;
  view_count?: number;
}

export interface ApiComment {
  id: number;
  post_id: number;
  author?: string;
  author_name?: string;
  author_email?: string;
  author_id?: number;
  content: string;
  parent_id?: number | null;
  created_at?: string;
}

export interface ApiTag {
  id: number;
  name: string;
}

export interface ApiResponse<T> {
  code: number;
  success: boolean;
  data?: T;
  message?: string;
}

export interface AdminStats {
  total_users: number;
  total_posts: number;
  total_comments: number;
  published_posts: number;
  draft_posts: number;
}

export interface AdminUser {
  id: number;
  username: string;
  email: string;
  role: string;
  created_at: string;
}

export interface AdminComment {
  id: number;
  post_id: number;
  post_title?: string;
  author_name: string;
  author_email?: string;
  content: string;
  created_at: string;
}

export interface AdminContact {
  id: number;
  name: string;
  email: string;
  message: string;
  created_at: string;
}

export interface UserProfile {
  id: number;
  username: string;
  email: string;
  role: string;
  bio: string;
  avatar: string;
  location: string;
  website: string;
  twitter: string;
  created_at: string;
  follower_count?: number;
  following_count?: number;
  is_following?: boolean;
}

export interface ApiNotification {
  id: number;
  type: string;
  actor_name: string;
  content: string;
  post_title?: string;
  is_read: boolean;
  created_at: string;
}

async function request<T>(path: string, options?: RequestInit, timeoutMs: number = REQUEST_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...options?.headers },
      signal: controller.signal,
      // @cuiruoni+P2修复：认证改用HttpOnly Cookie，请求必须携带凭证
      credentials: "include",
    });
    if (!res.ok) {
      if (res.status === 401) {
        localStorage.removeItem("blog_token");
        localStorage.removeItem("blog_logged_in");
        localStorage.removeItem("blog_user");
        window.dispatchEvent(new Event("auth-change"));
      }
      throw new Error(`API Error: ${res.status} ${res.statusText}`);
    }
    const payload = (await res.json()) as Record<string, unknown>;
    // 后端用 {code: 0} 表示成功，没有 success 字段；这里兼容转换
    if (payload && typeof payload === "object" && !("success" in payload) && "code" in payload) {
      payload.success = payload.code === 0;
    }
    return payload as T;
  } finally {
    window.clearTimeout(timeout);
  }
}

function normalizePost(p: ApiPost): ApiPost {
  return {
    ...p,
    content: p.content ?? p.content_md,
    excerpt: p.excerpt ?? p.summary,
    author_id: p.author_id ?? p.user_id,
    views: p.views ?? p.view_count,
    likes: p.likes ?? p.like_count ?? 0,
    comments_count: p.comments_count ?? p.comment_count ?? 0,
  };
}

function authHeaders(): Record<string, string> {
  // @cuiruoni+P2修复：登录态已迁移到HttpOnly Cookie，不再从localStorage读取token
  // 保留函数签名以兼容调用点，实际不附加Authorization头
  return {};
}

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  role: string;
}

export const authApi = {
  register: async (username: string, email: string, password: string) => {
    const res = await request<ApiResponse<{ token: string; user: AuthUser }>>(
      "/auth/register",
      { method: "POST", body: JSON.stringify({ username, email, password }) }
    );
    if (res.success && res.data?.token) {
      // @cuiruoni+P2修复：token由后端写入HttpOnly Cookie，前端不再存储
      void res.data.token;
    }
    return res;
  },

  login: async (email: string, password: string) => {
    const res = await request<ApiResponse<{ token: string; user: AuthUser }>>(
      "/auth/login",
      { method: "POST", body: JSON.stringify({ email, password }) }
    );
    if (res.success && res.data?.token) {
      // @cuiruoni+P2修复：token由后端写入HttpOnly Cookie，前端不再存储
      void res.data.token;
    }
    return res;
  },

  logout: async () => {
    try {
      await request("/auth/logout", { method: "POST", headers: authHeaders() });
    } catch { /* ignore */ }
    // @cuiruoni+清理旧版本遗留的localStorage登录态
    localStorage.removeItem("blog_token");
    localStorage.removeItem("blog_logged_in");
    localStorage.removeItem("blog_user");
  },
};

export const postsApi = {
  list: async (page = 1, limit = 10): Promise<ApiPost[]> => {
    const res = await request<ApiResponse<ApiPost[] | { posts: ApiPost[] }>>(`/posts?page=${page}&page_size=${limit}`);
    const posts = Array.isArray(res.data) ? res.data : res.data?.posts ?? [];
    return posts.map(normalizePost);
  },

  // @cuiruoni+分页版：连同 total 一起返回，供列表页计算总页数（Explore 的翻页按钮用）
  listPage: async (page = 1, pageSize = 10): Promise<{ posts: ApiPost[]; total: number }> => {
    const res = await request<ApiResponse<ApiPost[] | { posts: ApiPost[]; total?: number }>>(`/posts?page=${page}&page_size=${pageSize}`);
    const d = res.data;
    const posts = Array.isArray(d) ? d : d?.posts ?? [];
    return {
      posts: posts.map(normalizePost),
      total: d && !Array.isArray(d) ? d.total ?? posts.length : posts.length,
    };
  },

  get: async (id: number): Promise<ApiPost> => {
    // @cuiruoni+P0修复：带认证头请求，作者才能读取自己的草稿
    const res = await request<ApiResponse<ApiPost>>(`/posts/${id}`, { headers: authHeaders() });
    if (!res.data) throw new Error("Post not found");
    return normalizePost(res.data);
  },

  // @cuiruoni+cover / visibility 两个字段是 Write.tsx 与 showcase 场景 3 编辑器都在传的，
  // 原先类型声明里漏了 —— 靠"对象先赋给变量再传参"绕过了多余属性检查，声明补齐更准确
  create: async (data: {
    title: string;
    content_md: string;
    summary?: string;
    status?: string;
    tags?: string[];
    cover?: string;
    visibility?: string;
  }): Promise<ApiPost> => {
    const res = await request<ApiResponse<ApiPost>>("/posts", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.data) throw new Error("Failed to create post");
    return normalizePost(res.data);
  },

  update: async (id: number, data: Partial<ApiPost>): Promise<ApiPost> => {
    const res = await request<ApiResponse<ApiPost>>(`/posts/${id}`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.data) throw new Error("Failed to update post");
    return normalizePost(res.data);
  },

  delete: async (id: number): Promise<void> => {
    await request(`/posts/${id}`, { method: "DELETE", headers: authHeaders() });
  },

  // @cuiruoni+P1修复：点赞/收藏（后端持久化）
  like: async (id: number): Promise<void> => {
    await request(`/posts/${id}/like`, { method: "POST", headers: authHeaders() });
  },

  unlike: async (id: number): Promise<void> => {
    await request(`/posts/${id}/like`, { method: "DELETE", headers: authHeaders() });
  },

  bookmark: async (id: number): Promise<void> => {
    await request(`/posts/${id}/bookmark`, { method: "POST", headers: authHeaders() });
  },

  unbookmark: async (id: number): Promise<void> => {
    await request(`/posts/${id}/bookmark`, { method: "DELETE", headers: authHeaders() });
  },

  liked: async (page = 1, pageSize = 10): Promise<{ posts: ApiPost[]; total: number }> => {
    const res = await request<ApiResponse<{ posts: ApiPost[]; total: number }>>(
      `/posts/liked?page=${page}&page_size=${pageSize}`, { headers: authHeaders() });
    return res.data ?? { posts: [], total: 0 };
  },

  bookmarked: async (page = 1, pageSize = 10): Promise<{ posts: ApiPost[]; total: number }> => {
    const res = await request<ApiResponse<{ posts: ApiPost[]; total: number }>>(
      `/posts/bookmarked?page=${page}&page_size=${pageSize}`, { headers: authHeaders() });
    return res.data ?? { posts: [], total: 0 };
  },

  /** 我的文章：本人全部文章（含草稿），个人中心专用 */
  mine: async (page = 1, pageSize = 50): Promise<{ posts: ApiPost[]; total: number }> => {
    const res = await request<ApiResponse<{ posts: ApiPost[]; total: number }>>(
      `/posts/mine?page=${page}&page_size=${pageSize}`, { headers: authHeaders() });
    return res.data ?? { posts: [], total: 0 };
  },

  // @cuiruoni+草稿列表：status=draft 对非管理员即本人草稿（后端 P0 权限规则）
  drafts: async (page = 1, pageSize = 50): Promise<{ posts: ApiPost[]; total: number }> => {
    const res = await request<ApiResponse<{ posts: ApiPost[]; total: number }>>(
      `/posts?status=draft&page=${page}&page_size=${pageSize}`, { headers: authHeaders() });
    return res.data ?? { posts: [], total: 0 };
  },
};

export const commentsApi = {
  list: async (postId: number): Promise<ApiComment[]> => {
    const res = await request<ApiResponse<ApiComment[] | { comments: ApiComment[] }>>(`/posts/${postId}/comments`);
    return Array.isArray(res.data) ? res.data : res.data?.comments ?? [];
  },

  create: async (postId: number, content: string): Promise<ApiComment> => {
    const user = JSON.parse(localStorage.getItem("blog_user") ?? "{}");
    const res = await request<ApiResponse<ApiComment>>(`/posts/${postId}/comments`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        content,
        author_name: user.username ?? "匿名用户",
        author_email: user.email ?? "",
      }),
    });
    if (!res.data) throw new Error("Failed to create comment");
    return res.data;
  },
};

export const tagsApi = {
  list: async (): Promise<ApiTag[]> => {
    const res = await request<any>("/tags");
    // 后端返回 { code, data: { tags: [...] } }
    const tags = res?.data?.tags ?? res?.data ?? [];
    return Array.isArray(tags) ? tags : [];
  },

  posts: async (tagId: number): Promise<ApiPost[]> => {
    const res = await request<any>(`/tags/${tagId}/posts`);
    // 后端返回 { code, data: { posts: [...] } } 或 { code, data: [...] }
    const posts = res?.data?.posts ?? res?.data ?? [];
    return (Array.isArray(posts) ? posts : []).map(normalizePost);
  },
};

export const searchApi = {
  search: async (query: string): Promise<ApiPost[]> => {
    // @cuiruoni+P0修复：后端返回 {code, data: {query, results, total}}，兼容数组形态
    const res = await request<ApiResponse<ApiPost[] | { results: ApiPost[] }>>(`/search?q=${encodeURIComponent(query)}`);
    const data = res.data;
    const posts = Array.isArray(data) ? data : data?.results ?? [];
    return posts.map(normalizePost);
  },
};

export const adminApi = {
  stats: async (): Promise<AdminStats> => {
    const res = await request<ApiResponse<AdminStats>>("/admin/stats", { headers: authHeaders() });
    return res.data ?? { total_users: 0, total_posts: 0, total_comments: 0, published_posts: 0, draft_posts: 0 };
  },

  listUsers: async (page = 1, pageSize = 10): Promise<{ users: AdminUser[]; total: number }> => {
    const res = await request<ApiResponse<{ users: AdminUser[]; total: number }>>(`/admin/users?page=${page}&page_size=${pageSize}`, { headers: authHeaders() });
    return res.data ?? { users: [], total: 0 };
  },

  updateUserRole: async (id: number, role: string): Promise<void> => {
    await request(`/admin/users/${id}/role`, { method: "PUT", headers: authHeaders(), body: JSON.stringify({ role }) });
  },

  deleteUser: async (id: number): Promise<void> => {
    await request(`/admin/users/${id}`, { method: "DELETE", headers: authHeaders() });
  },

  listPosts: async (page = 1, pageSize = 10, status = "all"): Promise<{ posts: ApiPost[]; total: number }> => {
    const res = await request<ApiResponse<{ posts: ApiPost[]; total: number }>>(`/admin/posts?page=${page}&page_size=${pageSize}&status=${status}`, { headers: authHeaders() });
    return res.data ?? { posts: [], total: 0 };
  },

  deletePost: async (id: number): Promise<void> => {
    await request(`/admin/posts/${id}`, { method: "DELETE", headers: authHeaders() });
  },

  listComments: async (page = 1, pageSize = 10): Promise<{ comments: AdminComment[]; total: number }> => {
    const res = await request<ApiResponse<{ comments: AdminComment[]; total: number }>>(`/admin/comments?page=${page}&page_size=${pageSize}`, { headers: authHeaders() });
    return res.data ?? { comments: [], total: 0 };
  },

  deleteComment: async (id: number): Promise<void> => {
    await request(`/admin/comments/${id}`, { method: "DELETE", headers: authHeaders() });
  },

  // @cuiruoni+留言管理：场景 4 联系表单落库的数据
  listContacts: async (page = 1, pageSize = 10): Promise<{ contacts: AdminContact[]; total: number }> => {
    const res = await request<ApiResponse<{ contacts: AdminContact[]; total: number }>>(`/admin/contacts?page=${page}&page_size=${pageSize}`, { headers: authHeaders() });
    return res.data ?? { contacts: [], total: 0 };
  },

  deleteContact: async (id: number): Promise<void> => {
    await request(`/admin/contacts/${id}`, { method: "DELETE", headers: authHeaders() });
  },
};

export const profileApi = {
  get: async (): Promise<UserProfile | null> => {
    const res = await request<ApiResponse<UserProfile>>("/users/profile", { headers: authHeaders() });
    // @cuiruoni+P2修复：未登录时后端返回data=null，这里返回null供AuthProvider判断登录态
    return res.data ?? null;
  },

  update: async (data: Partial<Pick<UserProfile, "email" | "bio" | "avatar" | "location" | "website" | "twitter">>): Promise<UserProfile> => {
    const res = await request<ApiResponse<UserProfile>>("/users/profile", {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.data) throw new Error("Failed to update profile");
    return res.data;
  },

  changePassword: async (oldPassword: string, newPassword: string): Promise<void> => {
    await request("/auth/change-password", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
    });
  },

  getPublicProfile: async (username: string): Promise<UserProfile & { posts: ApiPost[] }> => {
    const res = await request<ApiResponse<UserProfile & { posts: ApiPost[] }>>(`/users/${encodeURIComponent(username)}`);
    if (!res.data) throw new Error("Profile not found");
    return res.data;
  },

  follow: async (username: string): Promise<void> => {
    await request(`/users/${encodeURIComponent(username)}/follow`, { method: "POST", headers: authHeaders() });
  },

  unfollow: async (username: string): Promise<void> => {
    await request(`/users/${encodeURIComponent(username)}/follow`, { method: "DELETE", headers: authHeaders() });
  },
};

export const contactApi = {
  send: async (name: string, email: string, message: string): Promise<void> => {
    await request("/contact", {
      method: "POST",
      body: JSON.stringify({ name, email, message }),
    });
  },
};

export const notificationsApi = {
  list: async (): Promise<ApiNotification[]> => {
    const res = await request<ApiResponse<ApiNotification[]>>("/notifications", { headers: authHeaders() });
    return Array.isArray(res.data) ? res.data : [];
  },

  markRead: async (id: number): Promise<void> => {
    await request(`/notifications/${id}/read`, { method: "PUT", headers: authHeaders() });
  },

  markAllRead: async (): Promise<void> => {
    await request("/notifications/read-all", { method: "PUT", headers: authHeaders() });
  },

  delete: async (id: number): Promise<void> => {
    await request(`/notifications/${id}`, { method: "DELETE", headers: authHeaders() });
  },
};

// @cuiruoni+通用图片上传 API：编辑器插图 / 文章封面共用（后端落盘 uploads/images/）
export const uploadApi = {
  /** File → base64 上传，返回可直接访问的 URL（/api/upload/file/xxx） */
  image: async (file: File): Promise<string> => {
    if (!file.type.startsWith("image/")) {
      throw new Error("只能上传图片文件");
    }
    if (file.size > 7.5 * 1024 * 1024) {
      throw new Error("图片过大，请压缩后重试（上限约 7.5MB）");
    }
    const image_base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result ?? "");
        // dataURL 形如 data:image/png;base64,xxxx —— 只取 base64 部分
        const idx = result.indexOf("base64,");
        resolve(idx >= 0 ? result.slice(idx + 7) : result);
      };
      reader.onerror = () => reject(new Error("读取图片失败"));
      reader.readAsDataURL(file);
    });
    const res = await request<ApiResponse<{ url: string }>>(
      "/upload/image",
      {
        method: "POST",
        body: JSON.stringify({ image_base64, image_mime: file.type }),
      },
      60_000
    );
    if (!res.success || !res.data?.url) {
      throw new Error(res.message || "上传失败");
    }
    return res.data.url;
  },
};

// @cuiruoni+视频投稿 API（用户投稿 → 管理员审核 → 启用唯一一支作为主页背景）
export interface VideoSubmission {
  id: number;
  uploader_id?: number;
  uploader_name?: string;
  filename?: string;
  original_name?: string;
  status: "pending" | "approved" | "rejected";
  is_active?: boolean;
  created_at?: string;
  /** 可播放地址（/api/videos/file/xxx） */
  url?: string;
}

export const videosApi = {
  /**
   * 断点续传上传（MP4/WebM，≤50MB）：
   * init 创建会话 → 按 1MB 顺序追加分片（Content-Range）→ complete 校验落库。
   * 单片失败自动查询服务端已收字节并对齐重试（最多 5 次）；onProgress 回传 0~100。
   */
  upload: async (file: File, onProgress?: (percent: number) => void): Promise<VideoSubmission> => {
    const okType = ["video/mp4", "video/webm"].includes(file.type) || /\.(mp4|webm)$/i.test(file.name);
    if (!okType) throw new Error("仅支持 MP4 / WebM 格式");
    if (file.size > 50 * 1024 * 1024) throw new Error("视频过大，上限 50MB");

    const CHUNK = 1024 * 1024;
    const MAX_RETRY = 5;

    // 1. init
    const initRes = await request<ApiResponse<{ upload_id: string; received: number }>>(
      "/videos/upload/init",
      { method: "POST", body: JSON.stringify({ file_size: file.size, filename: file.name }) },
      30_000
    );
    if (!initRes.success || !initRes.data?.upload_id) {
      throw new Error(initRes.message || "创建上传会话失败");
    }
    const uploadId = initRes.data.upload_id;
    let offset = Math.min(initRes.data.received ?? 0, file.size);
    onProgress?.(Math.floor((offset / file.size) * 100));

    // 2. 顺序追加分片
    while (offset < file.size) {
      const end = Math.min(offset + CHUNK, file.size) - 1;
      const slice = file.slice(offset, end + 1);
      let attempt = 0;
      // 单片重试循环：网络错误/409 时先查询服务端已收字节再对齐
      // eslint-disable-next-line no-constant-condition
      while (true) {
        attempt += 1;
        try {
          const res = await fetch(`${API_BASE}/videos/upload/${uploadId}`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/octet-stream",
              "Content-Range": `bytes ${offset}-${end}/${file.size}`,
            },
            body: slice,
            credentials: "include",
          });
          if (res.status === 409) {
            // 服务端收到的比本地 offset 多（重复片/竞态）：重新对齐
            const q = await fetch(`${API_BASE}/videos/upload/${uploadId}`, { credentials: "include" });
            const qj = (await q.json()) as ApiResponse<{ received: number }>;
            offset = Math.min(qj.data?.received ?? offset, file.size);
            break; // 重新对齐后跳出内层，继续 while 外层从新 offset 发
          }
          const pj = (await res.json()) as ApiResponse<{ received: number }>;
          if (!res.ok || pj.code !== 0) {
            throw new Error(pj.message || "分片上传失败");
          }
          offset = pj.data.received;
          break;
        } catch (err) {
          if (attempt >= MAX_RETRY) {
            // 彻底失败：放弃会话，把错误抛给调用方
            try {
              await fetch(`${API_BASE}/videos/upload/${uploadId}`, { method: "DELETE", credentials: "include" });
            } catch { /* 忽略 */ }
            throw err instanceof Error ? err : new Error("上传失败");
          }
          // 网络类失败：等待后查询断点，从服务端已收字节继续
          await new Promise((r) => setTimeout(r, 800 * attempt));
          try {
            const q = await fetch(`${API_BASE}/videos/upload/${uploadId}`, { credentials: "include" });
            if (q.status === 404) throw new Error("上传会话已过期，请重新上传");
            const qj = (await q.json()) as ApiResponse<{ received: number }>;
            offset = Math.min(qj.data?.received ?? offset, file.size);
          } catch (qErr) {
            if (qErr instanceof Error && qErr.message.includes("过期")) throw qErr;
          }
        }
      }
      onProgress?.(Math.floor((offset / file.size) * 100));
    }

    // 3. complete
    const compRes = await request<ApiResponse<VideoSubmission>>(
      `/videos/upload/${uploadId}/complete`,
      { method: "POST" },
      30_000
    );
    if (!compRes.success || !compRes.data) {
      throw new Error(compRes.message || "完成上传失败");
    }
    onProgress?.(100);
    return compRes.data;
  },

  /** 当前启用的背景视频（公开；全局唯一，没有则 null） */
  active: async (): Promise<VideoSubmission | null> => {
    const res = await request<ApiResponse<{ video: VideoSubmission | null }>>("/videos/active");
    return res.data?.video ?? null;
  },

  /** 我的投稿（含审核状态） */
  mine: async (): Promise<VideoSubmission[]> => {
    const res = await request<ApiResponse<{ videos: VideoSubmission[] }>>("/videos/mine", { headers: authHeaders() });
    return res.data?.videos ?? [];
  },

  remove: async (id: number): Promise<void> => {
    await request(`/videos/${id}`, { method: "DELETE", headers: authHeaders() });
  },

  /** 管理员：分页按状态查看投稿 */
  adminList: async (status: string, page = 1, pageSize = 10): Promise<{ videos: VideoSubmission[]; total: number }> => {
    const res = await request<ApiResponse<{ videos: VideoSubmission[]; total: number }>>(
      `/admin/videos?status=${status}&page=${page}&page_size=${pageSize}`, { headers: authHeaders() });
    return res.data ?? { videos: [], total: 0 };
  },

  /** 管理员：审核 */
  setStatus: async (id: number, status: "approved" | "rejected" | "pending"): Promise<void> => {
    await request(`/videos/${id}/status`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ status }),
    });
  },

  /** 管理员：启用/停用当前背景（全局唯一，启用时自动通过） */
  setActive: async (id: number, active: boolean): Promise<void> => {
    await request(`/videos/${id}/active`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ active }),
    });
  },
};

export async function checkBackendHealth(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    await fetch("/api/posts?page=1&page_size=1", { signal: controller.signal });
    clearTimeout(timeout);
    return true;
  } catch {
    return false;
  }
}
