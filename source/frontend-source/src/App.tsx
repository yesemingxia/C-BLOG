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
const StyleTransfer = React.lazy(() => import("./pages/StyleTransfer"));

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
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route path="/login" element={<PageTransition><Login /></PageTransition>} />
        <Route path="/register" element={<PageTransition><Login /></PageTransition>} />
        <Route path="/home" element={<PageTransition><Home /></PageTransition>} />
        <Route path="/explore" element={<PageTransition><Explore /></PageTransition>} />
        <Route path="/post/:id" element={<PageTransition><Post /></PageTransition>} />
        <Route path="/write" element={<ProtectedRoute><PageTransition><Write /></PageTransition></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><PageTransition><Profile /></PageTransition></ProtectedRoute>} />
        <Route path="/profile/:username" element={<PageTransition><Profile /></PageTransition>} />
        <Route path="/search" element={<PageTransition><SearchPage /></PageTransition>} />
        <Route path="/notifications" element={<ProtectedRoute><PageTransition><Notifications /></PageTransition></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><PageTransition><Settings /></PageTransition></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute adminOnly><PageTransition><Admin /></PageTransition></ProtectedRoute>} />
        <Route path="/style-transfer" element={<PageTransition><StyleTransfer /></PageTransition>} />
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
