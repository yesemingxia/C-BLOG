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

  get: async (id: number): Promise<ApiPost> => {
    // @cuiruoni+P0修复：带认证头请求，作者才能读取自己的草稿
    const res = await request<ApiResponse<ApiPost>>(`/posts/${id}`, { headers: authHeaders() });
    if (!res.data) throw new Error("Post not found");
    return normalizePost(res.data);
  },

  create: async (data: { title: string; content_md: string; summary?: string; status?: string; tags?: string[] }): Promise<ApiPost> => {
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

// @cuiruoni+图片风格转换 API（图片上传 → 后台 AI 生成）
export interface StyleOption {
  id: string;
  name: string;
  description: string;
  ratio: string;
}

export interface StyleTaskInfo {
  id: string;
  style: string;
  status: "pending" | "processing" | "done" | "failed";
  error?: string;
  result_url?: string;
  created_at?: string;
}

export const styleApi = {
  listStyles: async (): Promise<StyleOption[]> => {
    const res = await request<ApiResponse<StyleOption[]>>("/styles");
    return res.data ?? [];
  },

  transfer: async (
    style: string,
    imageBase64: string,
    imageMime: string
  ): Promise<{ task_id: string }> => {
    // @cuiruoni+图片 base64 体积大，上传超时放宽到 60 秒
    const res = await request<ApiResponse<{ task_id: string }>>(
      "/styles/transfer",
      {
        method: "POST",
        body: JSON.stringify({ style, image_base64: imageBase64, image_mime: imageMime }),
      },
      60_000
    );
    if (!res.success || !res.data?.task_id) {
      throw new Error(res.message || "提交失败");
    }
    return res.data;
  },

  getTask: async (taskId: string): Promise<StyleTaskInfo> => {
    const res = await request<ApiResponse<StyleTaskInfo>>(`/styles/tasks/${taskId}`);
    if (!res.success || !res.data) {
      throw new Error(res.message || "查询任务失败");
    }
    return res.data;
  },
};

// @cuiruoni+背景设置 API：服务器只留存配置信息（type/style_id/image_url），图片数据存浏览器本地
export interface BackgroundSettingInfo {
  type: string;
  style_id?: string;
  image_url?: string;
}

export const backgroundApi = {
  get: async (): Promise<{ background: BackgroundSettingInfo | null }> => {
    const res = await request<ApiResponse<{ background: BackgroundSettingInfo | null }>>(
      "/users/background"
    );
    return res.data ?? { background: null };
  },

  save: async (bg: BackgroundSettingInfo): Promise<void> => {
    await request("/users/background", {
      method: "PUT",
      body: JSON.stringify(bg),
      headers: authHeaders(),
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
