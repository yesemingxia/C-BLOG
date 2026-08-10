import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import { toast } from "sonner";
import { useEffect } from "react";

export const ProtectedRoute = ({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) => {
  const { isLoggedIn, ready, user } = useAuth();
  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (ready && !isLoggedIn) {
      toast.error("请先登录");
    } else if (ready && adminOnly && !isAdmin) {
      toast.error("无权访问管理后台");
    }
  }, [ready, isLoggedIn, adminOnly, isAdmin]);

  // @cuiruoni+P2修复：Cookie登录态需要异步确认，期间显示加载避免误跳转登录页
  if (!ready) {
    return <div className="min-h-screen flex items-center justify-center bg-[var(--background)] text-[var(--muted-foreground)]">加载中...</div>;
  }

  if (!isLoggedIn) {
    return <Navigate to="/login" replace />;
  }

  if (adminOnly && !isAdmin) {
    return <Navigate to="/home" replace />;
  }

  return <>{children}</>;
};
