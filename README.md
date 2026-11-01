# C-BLOG

基于 **C++17 + React** 的全栈博客系统。后端使用 Boost.Beast 构建高性能 HTTP 服务器，前端使用 React 19 + TypeScript + Tailwind CSS 打造现代化交互体验。

## 功能特性

### 后端

- RESTful API，基于 Boost.Beast 异步 HTTP 服务器
- JWT 身份认证 + 基于角色的权限控制（admin / user）
- MySQL 连接池（X DevAPI）+ Redis 缓存连接池
- Markdown 实时渲染为 HTML（cmark）
- 全文搜索（MySQL FULLTEXT 索引）
- CORS 跨域中间件
- PBKDF2 密码哈希（OpenSSL）
- spdlog 高性能日志

### 前端

- React 19 + TypeScript + Vite 构建
- Tailwind CSS 4 样式方案
- shadcn/ui + Radix UI 组件库
- TanStack Query 数据请求管理
- React Router v7 路由
- React Hook Form + Zod 表单校验
- 深色 / 浅色主题切换
- 响应式布局

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端语言 | C++17 |
| HTTP 框架 | Boost.Beast / Boost.Asio |
| 数据库 | MySQL 8+（X DevAPI） |
| 缓存 | Redis（hiredis） |
| 认证 | jwt-cpp + OpenSSL PBKDF2 |
| Markdown | cmark |
| 日志 | spdlog |
| 构建 | CMake 3.20+ / vcpkg |
| 前端框架 | React 19 + TypeScript |
| 构建工具 | Vite 7 |
| 样式 | Tailwind CSS 4 |
| UI 组件 | shadcn/ui (Radix UI) |
| 状态管理 | TanStack Query |
| 路由 | React Router v7 |

## 项目结构

```
C-BLOG/
├── CMakeLists.txt              # CMake 构建配置
├── config/
│   └── config.json             # 后端配置（需自行创建，不上传）
├── sql/
│   ├── schema.sql              # 数据库表结构
│   └── seed.sql                # 示例数据
├── src/                        # 后端源码
│   ├── main.cpp                # 入口
│   ├── controllers/            # 控制器（路由处理）
│   │   ├── auth_controller     # 认证：注册/登录
│   │   ├── post_controller     # 文章 CRUD
│   │   ├── comment_controller  # 评论
│   │   ├── tag_controller      # 标签
│   │   └── search_controller   # 搜索
│   ├── middleware/              # 中间件
│   │   ├── auth_middleware      # JWT 验证
│   │   └── cors_middleware      # 跨域处理
│   ├── services/               # 业务逻辑
│   │   ├── auth_service        # 认证服务
│   │   ├── post_service        # 文章服务
│   │   ├── markdown_service    # Markdown → HTML
│   │   └── search_service      # 全文搜索
│   ├── models/                 # 数据模型
│   ├── db/                     # 数据库连接池
│   │   ├── mysql_pool          # MySQL 连接池
│   │   └── redis_pool          # Redis 连接池
│   ├── server/                 # HTTP 服务器
│   │   ├── server              # 服务器主体
│   │   ├── session             # 会话管理
│   │   └── router              # 路由注册
│   └── utils/                  # 工具类
│       ├── config              # 配置加载
│       ├── logger              # 日志封装
│       ├── password            # 密码哈希
│       └── response            # 统一响应格式
└── source/frontend-source/     # 前端源码
    ├── package.json
    ├── vite.config.ts
    ├── tsconfig.json
    └── src/
        ├── pages/              # 页面
        │   ├── Home            # 首页
        │   ├── Explore         # 发现
        │   ├── Post            # 文章详情
        │   ├── Write           # 写文章
        │   ├── Login           # 登录
        │   ├── Profile         # 个人主页
        │   ├── SearchPage      # 搜索
        │   ├── Notifications   # 通知
        │   └── Settings        # 设置
        ├── components/         # 组件
        │   ├── Navbar          # 导航栏
        │   ├── BlogCard        # 博客卡片
        │   ├── GlassBackground # 毛玻璃背景
        │   ├── TimeAwareTheme  # 时间感知主题
        │   ├── MainLayout      # 主布局
        │   └── ui/             # shadcn/ui 组件
        ├── hooks/              # 自定义 Hooks
        └── lib/                # 工具函数
```

## 环境要求

- **CMake** ≥ 3.20
- **Boost** ≥ 1.88（需编译 system, filesystem, thread, program_options, json）
- **vcpkg**（管理 jwt-cpp, cmark, mysql-connector-cpp, OpenSSL, spdlog, hiredis）
- **MySQL** ≥ 8.0（需开启 X Protocol，默认端口 33060）
- **Redis** ≥ 6.0
- **Node.js** ≥ 18（前端开发）

## 快速开始

### 1. 克隆仓库

```bash
git clone git@github.com:yesemingxia/C-BLOG.git
cd C-BLOG
```

### 2. 后端构建与运行

```bash
# 安装 vcpkg 依赖（自动通过 CMakeToolchain 触发）
# 或手动安装：
#   vcpkg install jwt-cpp cmark mysql-connector-cpp openssl spdlog hiredis

# 构建
cmake -B build -S .
cmake --build build --config Release

# 创建配置文件
cp config/config.json.example config/config.json
# 编辑 config/config.json，填入你的数据库和 Redis 信息

# 初始化数据库
mysql -u root -p < sql/schema.sql
mysql -u root -p < sql/seed.sql

# 运行
./build/blog -c config/config.json
```

### 3. 前端开发

```bash
cd source/frontend-source
npm install
npm run dev
```

浏览器访问 `http://localhost:5173`，后端 API 默认运行在 `http://localhost:8089`。

## 配置说明

在 `config/` 目录下创建 `config.json`：

```json
{
    "server_host": "0.0.0.0",
    "server_port": 8089,
    "db_host": "<your_db_host>",
    "db_port": 33060,
    "db_user": "<your_db_user>",
    "db_password": "<your_db_password>",
    "db_name": "blog",
    "db_pool_size": 4,
    "redis_host": "<your_redis_host>",
    "redis_port": 6379,
    "redis_password": "<your_redis_password>",
    "redis_pool_size": 4,
    "jwt_secret": "<your_jwt_secret>",
    "jwt_expire_seconds": 86400,
    "log_level": "info",
    "log_file": "",
    "trust_proxy_real_ip": false,
    "storage_root": "uploads"
}
```

- `storage_root`（默认 `uploads`）：图片 / 视频 / 上传分片的落盘根目录。**相对值按「配置文件所属项目根」解析**，
  不再随进程工作目录变化（以前从 `build/Release` 启动会写到 `build/Release/uploads`，换回仓库根启动就读不到，
  表现为「上传成功但 404」）。要放去别处就写绝对路径，例如 `/var/lib/blog-uploads` 或 `E:/blog/uploads`。

- `trust_proxy_real_ip`（默认 `false`）：后端怎么认定客户端 IP。限流桶和浏览量去重都按这个 IP 计，
  而 `X-Real-IP` / `X-Client-IP` 都是客户端可自带的请求头，所以默认只认 TCP 对端地址。
  只有「Nginx 用 `$remote_addr` 覆写 `X-Real-IP`，且 8089 不直接对外暴露」时才设 `true`
  （或临时用环境变量 `TRUST_PROXY_REAL_IP=true` 覆盖）。跑 `tests/` 下的接口回归必须开它，
  因为脚本靠 `X-Real-IP` 给每个模拟客户端分桶。

> **注意**：`config/config.json` 包含敏感信息，已在 `.gitignore` 中排除，不会被提交到仓库。

## API 概览

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| POST | `/api/auth/register` | 用户注册 | - |
| POST | `/api/auth/login` | 用户登录 | - |
| GET | `/api/posts` | 获取文章列表 | - |
| GET | `/api/posts/:id` | 获取文章详情 | - |
| POST | `/api/posts` | 创建文章 | JWT |
| PUT | `/api/posts/:id` | 更新文章 | JWT |
| DELETE | `/api/posts/:id` | 删除文章 | JWT |
| GET | `/api/posts/:id/comments` | 获取评论列表 | - |
| POST | `/api/posts/:id/comments` | 发表评论 | - |
| GET | `/api/tags` | 获取标签列表 | - |
| GET | `/api/search?q=keyword` | 全文搜索 | - |
