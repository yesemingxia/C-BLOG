import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import { toast } from "sonner";
import { useEffect } from "react";

export const ProtectedRoute = ({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) => {
  const { isLoggedIn, user } = useAuth();
  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (!isLoggedIn) {
      toast.error("请先登录");
    } else if (adminOnly && !isAdmin) {
      toast.error("无权访问管理后台");
    }
  }, [isLoggedIn, adminOnly, isAdmin]);

  if (!isLoggedIn) {
    return <Navigate to="/login" replace />;
  }

  if (adminOnly && !isAdmin) {
    return <Navigate to="/home" replace />;
  }

  return <>{children}</>;
};
