import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import tailwindcss from "@tailwindcss/vite";
import fs from "fs";
import AutoImport from "unplugin-auto-import/vite";
import checker from "vite-plugin-checker";
import * as lucideIcons from "lucide-react";

// @cuiruoni+获取所有 lucide-react 导出的符号名，用于后续按需自动导入
const allLucideExports = Object.keys(lucideIcons).filter(
  (key) => key !== "default",
);

// @cuiruoni+扫描src目录找出实际使用的lucide图标，实现按需自动导入，减少打包体积
function getUsedLucideIcons() {
  const usedIcons = new Set<string>();
  const srcPath = path.resolve(__dirname, "./src");

  function scanDirectory(dir: string) {
    if (!fs.existsSync(dir)) return;

    const files = fs.readdirSync(dir);
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        scanDirectory(filePath);
      } else if (/\.(tsx?|jsx?)$/.test(file)) {
        const content = fs.readFileSync(filePath, "utf-8");

        // 匹配 JSX 标签和标识符使用
        for (const icon of allLucideExports) {
          // 匹配: <IconName、{IconName、= IconName、: IconName 等
          const patterns = [
            new RegExp(`<${icon}[\\s/>]`, "g"),
            new RegExp(`[{\\s,=:]${icon}[\\s,})]`, "g"),
          ];

          if (patterns.some((pattern) => pattern.test(content))) {
            usedIcons.add(icon);
          }
        }
      }
    }
  }

  scanDirectory(srcPath);
  return Array.from(usedIcons);
}

const usedLucideIcons = getUsedLucideIcons();

// https://vite.dev/config/
// @cuiruoni+Vite构建配置：Tailwind CSS插件、lucide图标自动导入、TypeScript类型检查
export default defineConfig({
  plugins: [
    react(),
    // @cuiruoni+Tailwind CSS v4 Vite插件，替代PostCSS方式集成
    tailwindcss(),
    // @cuiruoni+unplugin-auto-import：自动导入React hooks和lucide图标，无需手动import
    AutoImport({
      dts: "auto-imports.d.ts",
      include: [/\.[tj]sx?$/],
      imports: [
        "react",
        {
          "lucide-react": usedLucideIcons.filter((name) => name !== "Activity"),
        },
        // @cuiruoni+Activity同时存在于react和lucide-react，设置高优先级让lucide-react胜出且不产生警告
        {
          from: "lucide-react",
          imports: ["Activity"],
          priority: 2,
        },
      ],
      eslintrc: {
        enabled: false,
      },
    }),
    // @cuiruoni+vite-plugin-checker：构建时进行TypeScript类型检查，提前发现类型错误
    checker({
      typescript: {
        tsconfigPath: "tsconfig.app.json",
      },
      enableBuild: true,
    }),
  ],
  // @cuiruoni+路径别名：@映射到src目录，简化导入路径
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // @cuiruoni+开发代理：将/api请求转发到后端，避免跨域和硬编码端口
  server: {
    host: "0.0.0.0",
    proxy: {
      "/api": {
        target: "http://localhost:8089",
        changeOrigin: true,
      },
    },
  },
});
