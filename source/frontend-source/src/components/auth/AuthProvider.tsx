import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { authApi } from "../../lib/api";

interface AuthUser {
  id: number;
  username: string;
  email: string;
  role: string;
}

interface AuthContextValue {
  isLoggedIn: boolean;
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<{ success: boolean; message?: string }>;
  register: (username: string, email: string, password: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  isLoggedIn: false,
  user: null,
  login: async () => ({ success: false }),
  register: async () => ({ success: false }),
  logout: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const raw = localStorage.getItem("blog_user");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const isLoggedIn = !!user && !!localStorage.getItem("blog_token");

  const syncFromStorage = useCallback(() => {
    try {
      const raw = localStorage.getItem("blog_user");
      setUser(raw ? JSON.parse(raw) : null);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("storage", syncFromStorage);
    window.addEventListener("auth-change", syncFromStorage);
    return () => {
      window.removeEventListener("storage", syncFromStorage);
      window.removeEventListener("auth-change", syncFromStorage);
    };
  }, [syncFromStorage]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await authApi.login(email, password);
    if (res.success) {
      syncFromStorage();
      window.dispatchEvent(new Event("auth-change"));
    }
    return res;
  }, [syncFromStorage]);

  const register = useCallback(async (username: string, email: string, password: string) => {
    const res = await authApi.register(username, email, password);
    if (res.success) {
      syncFromStorage();
      window.dispatchEvent(new Event("auth-change"));
    }
    return res;
  }, [syncFromStorage]);

  const logout = useCallback(async () => {
    await authApi.logout();
    setUser(null);
    window.dispatchEvent(new Event("auth-change"));
  }, []);

  return (
    <AuthContext.Provider value={{ isLoggedIn, user, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
