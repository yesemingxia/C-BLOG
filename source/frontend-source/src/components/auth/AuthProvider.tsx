import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { authApi, profileApi } from "../../lib/api";

interface AuthUser {
  id: number;
  username: string;
  email: string;
  role: string;
}

interface AuthContextValue {
  isLoggedIn: boolean;
  ready: boolean;
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<{ success: boolean; message?: string }>;
  register: (username: string, email: string, password: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  isLoggedIn: false,
  ready: false,
  user: null,
  login: async () => ({ success: false }),
  register: async () => ({ success: false }),
  logout: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  const isLoggedIn = !!user;

  // @cuiruoni+P2修复：登录态从HttpOnly Cookie驱动，挂载/刷新时通过API确认
  const refreshUser = useCallback(async () => {
    try {
      const profile = await profileApi.get();
      setUser(profile);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    refreshUser().finally(() => setReady(true));
    window.addEventListener("auth-change", refreshUser);
    return () => {
      window.removeEventListener("auth-change", refreshUser);
    };
  }, [refreshUser]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await authApi.login(email, password);
    if (res.success && res.data?.user) setUser(res.data.user);
    return res;
  }, []);

  const register = useCallback(async (username: string, email: string, password: string) => {
    const res = await authApi.register(username, email, password);
    if (res.success && res.data?.user) setUser(res.data.user);
    return res;
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ isLoggedIn, ready, user, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
