import React, { Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { ThemeProvider } from "./components/theme/ThemeProvider";
import { AuthProvider } from "./components/auth/AuthProvider";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import NotFound from "./pages/NotFound";

// 核心公开页面直接同步加载，避免首次点击导航时还要请求 chunk（解决“第一次点击反应迟钝”）
import Home from "./pages/Home";
import Explore from "./pages/Explore";
import Post from "./pages/Post";
import Login from "./pages/Login";

// 低频/受保护页面保持懒加载，继续拆分 bundle
const Write = React.lazy(() => import("./pages/Write"));
const Profile = React.lazy(() => import("./pages/Profile"));
const SearchPage = React.lazy(() => import("./pages/SearchPage"));
const Notifications = React.lazy(() => import("./pages/Notifications"));
const Settings = React.lazy(() => import("./pages/Settings"));
const Admin = React.lazy(() => import("./pages/Admin"));

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
        <div className="min-h-screen flex items-center justify-center flex-col gap-3 bg-background text-foreground/60 p-6">
          <div className="text-lg font-bold">出现了一点小问题</div>
          <div className="max-w-2xl w-full text-xs font-mono bg-foreground/5 p-4 rounded-lg overflow-auto whitespace-pre-wrap">
            {this.state.error?.message}
            {"\n"}
            {this.state.error?.stack}
          </div>
          <button
            onClick={() => window.location.reload()}
            className="btn-primary-glass px-6 py-2 rounded-lg text-sm text-white"
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
          background: "rgba(255,255,255,0.95)",
          border: "1px solid rgba(99,102,241,0.2)",
          color: "rgba(15,23,42,0.9)",
          backdropFilter: "blur(20px)",
        },
      }}
    />
  );
};

const PageLoading = () => (
  <div className="min-h-screen flex items-center justify-center bg-background text-foreground/60">
    加载中...
  </div>
);

const App = () => (
  <BrowserRouter>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <ErrorBoundary>
            <Suspense fallback={<PageLoading />}>
              <Routes>
                <Route path="/" element={<Navigate to="/home" replace />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Login />} />
                <Route path="/home" element={<Home />} />
                <Route path="/explore" element={<Explore />} />
                <Route path="/post/:id" element={<Post />} />
                <Route path="/write" element={<ProtectedRoute><Write /></ProtectedRoute>} />
                <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
                <Route path="/profile/:username" element={<Profile />} />
                <Route path="/search" element={<SearchPage />} />
                <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
                <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
                <Route path="/admin" element={<ProtectedRoute adminOnly><Admin /></ProtectedRoute>} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
          <ThemedToaster />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </BrowserRouter>
);

export default App;
