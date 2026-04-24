import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import TimeAwareTheme from "./components/TimeAwareTheme";
import Login from "./pages/Login";
import Home from "./pages/Home";
import Explore from "./pages/Explore";
import Post from "./pages/Post";
import Write from "./pages/Write";
import Profile from "./pages/Profile";
import SearchPage from "./pages/SearchPage";
import Notifications from "./pages/Notifications";
import Settings from "./pages/Settings";

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
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

const App = () => (
  <BrowserRouter>
    <TimeAwareTheme />
    <ErrorBoundary>
      <Routes>
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
      </Routes>
    </ErrorBoundary>
    <Toaster
      position="top-right"
      toastOptions={{
        style: {
          background: `rgba(15,18,40,0.92)`,
          border: `1px solid rgba(124,106,255,0.25)`,
          color: `rgba(232,234,246,0.9)`,
          backdropFilter: `blur(20px)`,
        },
      }}
    />
  </BrowserRouter>
);

export default App;
