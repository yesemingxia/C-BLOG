import { useLocation } from "react-router-dom";
import { useEffect } from "react";

// @cuiruoni+404页面组件：记录非法路由访问日志，提供返回首页链接
const NotFound = () => {
  const location = useLocation();

  // @cuiruoni+在控制台记录用户尝试访问的非法路径，便于排查路由配置问题
  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">404</h1>
        <p className="mb-4 text-xl text-gray-600">Oops! Page not found</p>
        <a href="/" className="text-blue-500 underline hover:text-blue-700">
          Return to Home
        </a>
      </div>
    </div>
  );
};

export default NotFound;
