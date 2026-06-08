import React, { Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { ThemeProvider, useTheme } from "./components/ThemeProvider";

const Login = React.lazy(() => import("./pages/Login"));
const Home = React.lazy(() => import("./pages/Home"));
const Explore = React.lazy(() => import("./pages/Explore"));
const Post = React.lazy(() => import("./pages/Post"));
const Write = React.lazy(() => import("./pages/Write"));
const Profile = React.lazy(() => import("./pages/Profile"));
const SearchPage = React.lazy(() => import("./pages/SearchPage"));
const Notifications = React.lazy(() => import("./pages/Notifications"));
const Settings = React.lazy(() => import("./pages/Settings"));
const Admin = React.lazy(() => import("./pages/Admin"));

// @cuiruoni+错误边界组件：捕获子组件树中的运行时异常，防止整个应用白屏崩溃
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  // @cuiruoni+静态生命周期：渲染阶段捕获错误，更新state触发降级UI
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  // @cuiruoni+提交阶段副作用：记录错误日志，可用于上报错误监控平台
  componentDidCatch(error: Error) {
    console.log(`ErrorBoundary caught:`, error);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: `100vh`,
            display: `flex`,
            alignItems: `center`,
            justifyContent: `center`,
            flexDirection: `column`,
            gap: 12,
            color: `rgba(232,234,246,0.6)`,
            background: `#050816`,
          }}
        >
          <div style={{ fontSize: 48 }}>💫</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: `rgba(232,234,246,0.8)` }}>出现了一点小问题</div>
          <div style={{ fontSize: 14 }}>请刷新页面重试</div>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: 8,
              padding: `10px 24px`,
              borderRadius: 12,
              background: `linear-gradient(135deg, #7c6aff, #38bdf8)`,
              color: `white`,
              border: `none`,
              cursor: `pointer`,
              fontWeight: 600,
            }}
          >
            刷新页面
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/* Toaster that adapts to current theme */
// @cuiruoni+主题化通知组件：根据当前深色/浅色模式动态切换Toast样式，保持视觉一致性
const ThemedToaster = () => {
  const { isDark } = useTheme();
  return (
    <Toaster
      position="top-right"
      toastOptions={{
        style: {
          background: isDark ? `rgba(15,18,40,0.92)` : `rgba(255,255,255,0.92)`,
          border: `1px solid ${isDark ? 'rgba(124,106,255,0.25)' : 'rgba(99,102,241,0.2)'}`,
          color: isDark ? `rgba(232,234,246,0.9)` : `rgba(15,23,42,0.9)`,
          backdropFilter: `blur(20px)`,
        },
      }}
    />
  );
};

const PageLoading = () => (
  <div
    className="min-h-screen flex items-center justify-center"
    style={{ background: `#050816`, color: `rgba(232,234,246,0.7)` }}
  >
    加载中...
  </div>
);

// @cuiruoni+应用根组件：组装路由、主题、错误边界和全局通知，形成完整的应用壳
const App = () => (
  <BrowserRouter>
    {/* @cuiruoni+ThemeProvider必须包裹在最外层，确保所有子组件都能访问主题上下文 */}
    <ThemeProvider>
      <ErrorBoundary>
        <Suspense fallback={<PageLoading />}>
          <Routes>
            {/* @cuiruoni+根路径重定向到/home，统一首页入口 */}
            <Route path="/" element={<Navigate to="/home" replace />} />
            <Route path="/login" element={<Login />} />
            <Route path="/home" element={<Home />} />
            <Route path="/explore" element={<Explore />} />
            <Route path="/post" element={<Post />} />
            <Route path="/write" element={<Write />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/admin" element={<Admin />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
      {/* @cuiruoni+ThemedToaster放在ThemeProvider内但Routes外，确保全局可用且可读取主题 */}
      <ThemedToaster />
    </ThemeProvider>
  </BrowserRouter>
);

export default App;
