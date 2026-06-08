/**
 * API 服务层 — 对接后端 REST API
 * 开发环境通过 Vite proxy 转发 /api 到后端，生产环境需配置反向代理
 * 认证接口默认不降级。
 */

// @cuiruoni+后端API基础地址，开发环境使用Vite代理，无需硬编码后端端口
const API_BASE = "/api";
const REQUEST_TIMEOUT_MS = 8000;
// @cuiruoni+Mock认证已禁用：生产环境不允许绕过认证，开发环境应确保后端可用
const ENABLE_AUTH_MOCK = false;

/* ── Types ── */
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
  success: boolean;
  data?: T;
  message?: string;
}

/* ── Helper ── */
// @cuiruoni+通用请求封装：统一处理JSON头、错误状态码，所有API调用都经过此函数
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...options?.headers },
      signal: controller.signal,
    });
    // @cuiruoni+非2xx状态码直接抛出异常，由调用方决定是否降级
    if (!res.ok) throw new Error(`API Error: ${res.status} ${res.statusText}`);
    return res.json();
  } finally {
    window.clearTimeout(timeout);
  }
}

function authUnavailableResponse() {
  return { success: false, message: "服务暂时不可用，请稍后重试" };
}

function normalizePost(p: ApiPost): ApiPost {
  return {
    ...p,
    content: p.content ?? p.content_md,
    excerpt: p.excerpt ?? p.summary,
    author_id: p.author_id ?? p.user_id,
    views: p.views ?? p.view_count,
  };
}

// @cuiruoni+从localStorage读取JWT token，用于鉴权请求
function getToken(): string | null {
  return localStorage.getItem("blog_token");
}

// @cuiruoni+构造Authorization请求头，token存在时附加Bearer认证
function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/* ═════════════════════════════════════════════
   Auth API — /api/auth
   ═════════════════════════════════════════════ */
export const authApi = {
  /** POST /api/auth/register */
  register: async (username: string, email: string, password: string) => {
    try {
      const res = await request<ApiResponse<{ token: string; user: { id: number; username: string; email: string } }>>(
        "/auth/register",
        {
          method: "POST",
          body: JSON.stringify({ username, email, password }),
        }
      );
      // @cuiruoni+注册成功后持久化token和用户信息到localStorage，实现登录态保持
      if (res.success && res.data?.token) {
        localStorage.setItem("blog_token", res.data.token);
        localStorage.setItem("blog_logged_in", "true");
        localStorage.setItem("blog_user", JSON.stringify(res.data.user));
      }
      return res;
    } catch {
      if (ENABLE_AUTH_MOCK) {
        localStorage.setItem("blog_token", "mock-token");
        localStorage.setItem("blog_logged_in", "true");
        localStorage.setItem("blog_user", JSON.stringify({ id: 1, username, email }));
        return { success: true, data: { token: "mock-token", user: { id: 1, username, email } } };
      }
      return authUnavailableResponse();
    }
  },

  /** POST /api/auth/login */
  login: async (email: string, password: string) => {
    try {
      const res = await request<ApiResponse<{ token: string; user: { id: number; username: string; email: string } }>>(
        "/auth/login",
        {
          method: "POST",
          body: JSON.stringify({ email, password }),
        }
      );
      if (res.success && res.data?.token) {
        localStorage.setItem("blog_token", res.data.token);
        localStorage.setItem("blog_logged_in", "true");
        localStorage.setItem("blog_user", JSON.stringify(res.data.user));
      }
      return res;
    } catch {
      if (ENABLE_AUTH_MOCK) {
        localStorage.setItem("blog_token", "mock-token");
        localStorage.setItem("blog_logged_in", "true");
        localStorage.setItem("blog_user", JSON.stringify({ id: 1, username: "Nova Chen", email }));
        return { success: true, data: { token: "mock-token", user: { id: 1, username: "Nova Chen", email } } };
      }
      return authUnavailableResponse();
    }
  },

  /** POST /api/auth/logout */
  logout: async () => {
    try {
      await request("/auth/logout", { method: "POST", headers: authHeaders() });
    } catch {
      /* ignore */
    }
    // @cuiruoni+无论后端logout是否成功，都清除本地登录态，确保用户端退出
    localStorage.removeItem("blog_token");
    localStorage.removeItem("blog_logged_in");
    localStorage.removeItem("blog_user");
  },
};

/* ═════════════════════════════════════════════
   Posts API — /api/posts
   ═════════════════════════════════════════════ */

export const postsApi = {
  /** GET /api/posts?page=1&limit=10 */
  list: async (page = 1, limit = 10): Promise<ApiPost[]> => {
    try {
      const res = await request<ApiResponse<ApiPost[] | { posts: ApiPost[] }>>(`/posts?page=${page}&page_size=${limit}`);
      const posts = Array.isArray(res.data) ? res.data : res.data?.posts ?? [];
      return posts.map(normalizePost);
    } catch {
      return [];
    }
  },

  /** GET /api/posts/:id */
  get: async (id: number): Promise<ApiPost | null> => {
    try {
      const res = await request<ApiResponse<ApiPost>>(`/posts/${id}`);
      return res.data ? normalizePost(res.data) : null;
    } catch {
      return null;
    }
  },

  /** POST /api/posts (auth required) */
  create: async (data: { title: string; content_md: string; summary?: string; status?: string; tags?: string[] }): Promise<ApiPost | null> => {
    try {
      const res = await request<ApiResponse<ApiPost>>("/posts", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(data),
      });
      return res.data ? normalizePost(res.data) : null;
    } catch {
      return null;
    }
  },

  /** PUT /api/posts/:id (auth required) */
  update: async (id: number, data: Partial<ApiPost>): Promise<ApiPost | null> => {
    try {
      const res = await request<ApiResponse<ApiPost>>(`/posts/${id}`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify(data),
      });
      return res.data ? normalizePost(res.data) : null;
    } catch {
      return null;
    }
  },

  /** DELETE /api/posts/:id (auth required) */
  delete: async (id: number): Promise<boolean> => {
    try {
      await request(`/posts/${id}`, { method: "DELETE", headers: authHeaders() });
      return true;
    } catch {
      return false;
    }
  },
};

/* ═════════════════════════════════════════════
   Comments API — /api/posts/:id/comments
   ═════════════════════════════════════════════ */
export const commentsApi = {
  /** GET /api/posts/:id/comments */
  list: async (postId: number): Promise<ApiComment[]> => {
    try {
      const res = await request<ApiResponse<ApiComment[] | { comments: ApiComment[] }>>(`/posts/${postId}/comments`);
      return Array.isArray(res.data) ? res.data : res.data?.comments ?? [];
    } catch {
      return [];
    }
  },

  /** POST /api/posts/:id/comments (auth required) */
  create: async (postId: number, content: string): Promise<ApiComment | null> => {
    try {
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
      return res.data ?? null;
    } catch {
      return null;
    }
  },
};

/* ═════════════════════════════════════════════
   Tags API — /api/tags
   ═════════════════════════════════════════════ */
export const tagsApi = {
  /** GET /api/tags */
  list: async (): Promise<ApiTag[]> => {
    try {
      const res = await request<ApiResponse<ApiTag[]>>("/tags");
      return res.data ?? [];
    } catch {
      return [];
    }
  },

  /** GET /api/tags/:id/posts */
  posts: async (tagId: number): Promise<ApiPost[]> => {
    try {
      const res = await request<ApiResponse<ApiPost[]>>(`/tags/${tagId}/posts`);
      return (res.data ?? []).map(normalizePost);
    } catch {
      return [];
    }
  },
};

/* ═════════════════════════════════════════════
   Search API — /api/search
   ═════════════════════════════════════════════ */
export const searchApi = {
  /** GET /api/search?q=keyword */
  search: async (query: string): Promise<ApiPost[]> => {
    try {
      const res = await request<ApiResponse<ApiPost[]>>(`/search?q=${encodeURIComponent(query)}`);
      return (res.data ?? []).map(normalizePost);
    } catch {
      return [];
    }
  },
};

/* ═════════════════════════════════════════════
   Admin API — /api/admin
   ═════════════════════════════════════════════ */

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

export const adminApi = {
  /** GET /api/admin/stats */
  stats: async (): Promise<AdminStats> => {
    try {
      const res = await request<ApiResponse<AdminStats>>("/admin/stats", { headers: authHeaders() });
      return res.data ?? { total_users: 0, total_posts: 0, total_comments: 0, published_posts: 0, draft_posts: 0 };
    } catch {
      return { total_users: 0, total_posts: 0, total_comments: 0, published_posts: 0, draft_posts: 0 };
    }
  },

  /** GET /api/admin/users?page=1&page_size=10 */
  listUsers: async (page = 1, pageSize = 10): Promise<{ users: AdminUser[]; total: number }> => {
    try {
      const res = await request<ApiResponse<{ users: AdminUser[]; total: number }>>(`/admin/users?page=${page}&page_size=${pageSize}`, { headers: authHeaders() });
      return res.data ?? { users: [], total: 0 };
    } catch {
      return { users: [], total: 0 };
    }
  },

  /** PUT /api/admin/users/:id/role */
  updateUserRole: async (id: number, role: string): Promise<boolean> => {
    try {
      await request(`/admin/users/${id}/role`, { method: "PUT", headers: authHeaders(), body: JSON.stringify({ role }) });
      return true;
    } catch {
      return false;
    }
  },

  /** DELETE /api/admin/users/:id */
  deleteUser: async (id: number): Promise<boolean> => {
    try {
      await request(`/admin/users/${id}`, { method: "DELETE", headers: authHeaders() });
      return true;
    } catch {
      return false;
    }
  },

  /** GET /api/admin/posts?page=1&page_size=10&status=all */
  listPosts: async (page = 1, pageSize = 10, status = "all"): Promise<{ posts: ApiPost[]; total: number }> => {
    try {
      const res = await request<ApiResponse<{ posts: ApiPost[]; total: number }>>(`/admin/posts?page=${page}&page_size=${pageSize}&status=${status}`, { headers: authHeaders() });
      return res.data ?? { posts: [], total: 0 };
    } catch {
      return { posts: [], total: 0 };
    }
  },

  /** DELETE /api/admin/posts/:id */
  deletePost: async (id: number): Promise<boolean> => {
    try {
      await request(`/admin/posts/${id}`, { method: "DELETE", headers: authHeaders() });
      return true;
    } catch {
      return false;
    }
  },

  /** GET /api/admin/comments?page=1&page_size=10 */
  listComments: async (page = 1, pageSize = 10): Promise<{ comments: AdminComment[]; total: number }> => {
    try {
      const res = await request<ApiResponse<{ comments: AdminComment[]; total: number }>>(`/admin/comments?page=${page}&page_size=${pageSize}`, { headers: authHeaders() });
      return res.data ?? { comments: [], total: 0 };
    } catch {
      return { comments: [], total: 0 };
    }
  },

  /** DELETE /api/admin/comments/:id */
  deleteComment: async (id: number): Promise<boolean> => {
    try {
      await request(`/admin/comments/${id}`, { method: "DELETE", headers: authHeaders() });
      return true;
    } catch {
      return false;
    }
  },
};

/* ═════════════════════════════════════════════
   User Profile API — /api/users
   ═════════════════════════════════════════════ */

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
}

export const profileApi = {
  /** GET /api/users/profile */
  get: async (): Promise<UserProfile | null> => {
    try {
      const res = await request<ApiResponse<UserProfile>>("/users/profile", { headers: authHeaders() });
      return res.data ?? null;
    } catch {
      return null;
    }
  },

  /** PUT /api/users/profile */
  update: async (data: Partial<Pick<UserProfile, "email" | "bio" | "avatar" | "location" | "website" | "twitter">>): Promise<UserProfile | null> => {
    try {
      const res = await request<ApiResponse<UserProfile>>("/users/profile", {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify(data),
      });
      return res.data ?? null;
    } catch {
      return null;
    }
  },

  /** POST /api/auth/change-password */
  changePassword: async (oldPassword: string, newPassword: string): Promise<boolean> => {
    try {
      await request("/auth/change-password", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
      });
      return true;
    } catch {
      return false;
    }
  },

  /** GET /api/users/:username — public profile with posts */
  getPublicProfile: async (username: string): Promise<UserProfile & { posts: ApiPost[] } | null> => {
    try {
      const res = await request<ApiResponse<UserProfile & { posts: ApiPost[] }>>(`/users/${encodeURIComponent(username)}`);
      return res.data ?? null;
    } catch {
      return null;
    }
  },
};

/* ── Utility: check if backend is reachable ── */
// @cuiruoni+后端健康检查：3秒超时探测，用于判断是否需要走mock降级
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
