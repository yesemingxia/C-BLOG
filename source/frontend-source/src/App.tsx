import React, { Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AnimatePresence } from "framer-motion";
import { Toaster } from "sonner";
import { ThemeProvider } from "./components/theme/ThemeProvider";
import { AuthProvider } from "./components/auth/AuthProvider";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import PageTransition from "./components/layout/PageTransition";
import { CursorGlow } from "./components/effects";
import NotFound from "./pages/NotFound";

// 核心公开页面直接同步加载，避免首次点击导航时还要请求 chunk（解决"第一次点击反应迟钝"）
import Login from "./pages/Login";

// @cuiruoni+展示页（showcase）就是前端本体；旧博客页面（Home/Explore/Post 等）已移除，
// 写文章走 showcase 场景 3 编辑器，后台在 /admin。
const Admin = React.lazy(() => import("./pages/Admin"));
const ProfileCenter = React.lazy(() => import("./pages/ProfileCenter"));

// 场景滚动作品集：从 D:\person 迁移而来，整页自成一体的全屏舞台
const Showcase = React.lazy(() => import("./showcase/Showcase"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  state: { hasError: boolean; error?: Error } = { hasError: false };
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error) {
    console.error("ErrorBoundary caught:", error);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center flex-col gap-3 bg-[var(--background)] text-[var(--muted-foreground)] p-6">
          <div className="text-lg font-bold">出现了一点小问题</div>
          <div className="max-w-2xl w-full text-xs font-mono bg-[var(--muted)] p-4 rounded-lg overflow-auto whitespace-pre-wrap">
            {this.state.error?.message}
            {"\n"}
            {this.state.error?.stack}
          </div>
          <button
            onClick={() => window.location.reload()}
            className="btn-primary px-6 py-2 rounded-lg text-sm text-[var(--primary-foreground)]"
          >
            刷新页面
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const ThemedToaster = () => {
  return (
    <Toaster
      position="top-right"
      toastOptions={{
        style: {
          background: "var(--card)",
          border: "1px solid var(--border)",
          color: "var(--foreground)",
        },
      }}
    />
  );
};

const PageLoading = () => (
  <div className="min-h-screen flex items-center justify-center bg-[var(--background)] text-[var(--muted-foreground)]">
    加载中...
  </div>
);

const AnimatedRoutes = () => {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        {/* @cuiruoni+showcase 是门面兼博客本体（/），登录 /login、后台 /admin。
            showcase 顶栏与入场层里有常驻入口（见 Topbar/IntroOverlay）。 */}
        <Route path="/" element={<Navigate to="/showcase" replace />} />
        {/* 登录页已换成 showcase 皮肤，内部 backdrop 是 fixed 布局 ——
            **不能**包 PageTransition：它的 translateY + blur 会创建 containing block，
            让 backdrop 整块缩进内容区（与 /showcase 不包它是同一个原因）。 */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Login />} />
        <Route path="/admin" element={<ProtectedRoute adminOnly><Admin /></ProtectedRoute>} />
        {/* 个人管理中心：所有登录用户可用 */}
        <Route path="/profile" element={<ProtectedRoute><ProfileCenter /></ProtectedRoute>} />
        {/* showcase：刻意**不包** PageTransition —— 它的 translateY 与 blur() 会创建
            containing block，让 person 的全屏 fixed 舞台（.video-stage / .topbar /
            .progress-ui / 弹窗 / 轮播）全部错位。也**不用** MainLayout，因为 person
            自带背景层与顶栏，套上去会两套背景叠加。详见 showcase/Showcase.tsx 顶部注释。 */}
        <Route path="/showcase" element={<Showcase />} />
        <Route path="*" element={<PageTransition><NotFound /></PageTransition>} />
      </Routes>
    </AnimatePresence>
  );
};

const App = () => (
  <BrowserRouter>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <ErrorBoundary>
            <CursorGlow />
            <Suspense fallback={<PageLoading />}>
              <AnimatedRoutes />
            </Suspense>
          </ErrorBoundary>
          <ThemedToaster />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </BrowserRouter>
);

export default App;
