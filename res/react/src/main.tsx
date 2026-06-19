import { createRoot } from "react-dom/client";
import App from "./App.tsx";
// @cuiruoni+全局样式入口，包含Tailwind指令和自定义CSS变量
import "./index.css";

// @cuiruoni+React 18的createRoot API挂载应用，启用并发渲染特性
createRoot(document.getElementById("root")!).render(<App />);
