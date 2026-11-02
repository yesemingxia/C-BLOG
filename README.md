# C-BLOG

基于 **C++17 + React** 的全栈博客系统。后端使用 Boost.Beast 构建高性能 HTTP 服务器，前端使用 React 19 + TypeScript + Tailwind CSS 打造现代化交互体验。

## 功能特性

### 后端

- RESTful API，基于 Boost.Beast 多线程异步 HTTP 服务器
- JWT 身份认证 + 基于角色的权限控制（admin / user），登出走 Redis token 黑名单
- MySQL 连接池（X DevAPI）+ Redis 缓存连接池；启动时自动建表并跑迁移
- Markdown 实时渲染为 HTML（cmark）
- 全文搜索（MySQL FULLTEXT ngram 索引）+ 匿名结果 Redis 缓存，可见性变更即时失效
- 图片上传、视频投稿与分片上传（断点续传 / 重试 / 取消 / 过期 `.part` 清理）
- 媒体支持 HTTP Range（`206` / `Content-Range` / `HEAD` / 越界 `416`），分块流式发送不整文件进内存
- 按客户端 IP 的限流中间件；IP 认定口径集中在一处，防伪造头绕过
- CORS 跨域中间件（支持多来源）
- PBKDF2 密码哈希（OpenSSL）
- spdlog 高性能日志

### 前端

- React 19 + TypeScript + Vite 构建
- Tailwind CSS 4 样式方案
- shadcn/ui + Radix UI 组件库
- React Router v7 路由
- 深色 / 浅色主题切换
- 响应式布局

> 数据请求是 `src/lib/api.ts` 里的受控封装（`fetch` + `useState`/`useEffect`），表单也是手写校验；
> `package.json` 里的 `@tanstack/react-query` 只在 `App.tsx` 挂了 Provider、没有任何 `useQuery` 调用点，
> `react-hook-form` / `zod` 则只被没人引用的 `components/ui/form.tsx` 脚手架用到 —— 属于历史遗留依赖，
> 想精简可以连同那个文件一起删。

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
| 状态管理 | 无独立状态库（受控组件 + `lib/api.ts` 封装） |
| 路由 | React Router v7 |

## 项目结构

```
C-BLOG/
├── CMakeLists.txt              # CMake 构建配置
├── config/
│   └── config.json             # 后端配置（需自行创建，不上传）
├── sql/
│   ├── schema.sql              # 数据库表结构（新库直接导这个）
│   └── seed.sql                # 只有说明没有数据：管理员必须「注册后改 role」，见下方第 2 步
├── tests/                      # 单元 + 接口回归（见「测试与验证」一节）
├── docker-compose.yml          # MySQL + Redis + 后端 + nginx 前端
├── nginx.conf                  # 容器内反代（含媒体 Range 透传）
├── start.bat                   # Windows 一键：缺配置时自动生成、构建、起后端
├── src/                        # 后端源码
│   ├── main.cpp                # 入口
│   ├── controllers/            # 控制器（路由处理）
│   │   ├── auth_controller     # 注册/登录/资料/自助注销
│   │   ├── post_controller     # 文章 CRUD、点赞收藏、浏览量
│   │   ├── comment_controller  # 评论（分页 + 楼中楼 + 作者可自删）
│   │   ├── tag_controller      # 标签
│   │   ├── search_controller   # 搜索（分页）
│   │   ├── notification_controller # 通知（分页 + 未读数）
│   │   ├── upload_controller   # 图片上传与公开读取
│   │   ├── video_controller    # 视频投稿与分片上传
│   │   ├── contact_controller  # 留言
│   │   └── admin_controller    # 后台四个列表 + 统计/趋势 + 管理动作
│   ├── middleware/              # 中间件
│   │   ├── auth_middleware      # JWT 验证
│   │   ├── cors_middleware      # 跨域处理（支持多来源）
│   │   └── rate_limiter         # 按归一后的客户端 IP 限流
│   ├── services/               # 业务逻辑
│   │   ├── auth_service        # 认证服务（token 签发/黑名单/登录失败两层锁定）
│   │   ├── post_service        # 文章服务（含图片回收编排）
│   │   ├── markdown_service    # Markdown → HTML
│   │   ├── search_service      # 全文搜索 + Redis 缓存
│   │   └── video_upload_service # 分片上传会话、断点续传、.part 清理
│   ├── models/                 # 数据模型
│   ├── db/                     # 数据库连接池
│   │   ├── mysql_pool          # MySQL 连接池
│   │   ├── redis_pool          # Redis 连接池
│   │   └── database            # 建表与迁移（迁移 11–18）
│   ├── server/                 # HTTP 服务器
│   │   ├── server              # 多线程 io_context 服务器主体
│   │   ├── session             # 会话管理（客户端 IP 归一、文件响应分流）
│   │   ├── router              # 路由注册（普通路由 + 文件路由）
│   │   └── file_slice_body     # Range 分块流式响应
│   └── utils/                  # 工具类
│       ├── config              # 配置加载（含环境变量覆盖与密钥强度守卫）
│       ├── client_ip           # 客户端 IP 认定口径（限流/去重/登录锁定共用）
│       ├── storage             # 媒体根目录与图片文件名安全校验
│       ├── sanitize            # 分页夹紧、LIKE 转义、URL 白名单
│       ├── http_range          # Range 头解析
│       ├── mentions            # 评论 @ 解析
│       ├── logger              # 日志封装
│       ├── password            # 密码哈希
│       └── response            # 统一响应格式
└── source/frontend-source/     # 前端源码
    ├── package.json
    ├── vite.config.ts          # dev 期把 /api 代理到 http://localhost:8089
    ├── tsconfig.json
    └── src/
        ├── App.tsx             # 路由：/ 重定向到 /showcase，/login /admin /profile
        ├── pages/
        │   ├── Login           # 登录与注册同一组件
        │   ├── ProfileCenter   # 个人中心：资料、文章管理、通知（带分页与未读角标）
        │   ├── Admin           # 后台：用户/文章/评论/留言四个列表（搜索+排序+趋势）
        │   └── NotFound
        ├── showcase/           # 唯一的内容前台（原 Home/Explore/Post/Write 已并入这里）
        │   ├── Showcase.tsx
        │   ├── components/     # SceneWork（流+搜索+标签+翻页）、PostModal、SceneEditor、PostCards…
        │   ├── effects/        # 入场层视频等
        │   └── lib/            # 状态机与导航
        ├── styles/             # 含 showcase-*.css
        ├── components/         # ui/（shadcn）、layout/、theme/、auth/、blog/
        ├── hooks/
        └── lib/api.ts          # 接口封装；列表统一经 normalizePost 归一字段名
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
# 仓库里**没有** config/config.json.example —— config/ 整个被 .gitignore 排除，避免把真实口令带进版本库。
#   Windows：直接跑 start.bat，它在缺配置时会自动生成一份带随机 jwt_secret 的 config/config.json
#   其它系统：照下面「配置说明」里的 JSON 手写一份 config/config.json

# 初始化数据库
mysql -u root -p < sql/schema.sql
# seed.sql 只有注释没有数据；且首次启动会自动补齐建表与迁移（src/db/database.cpp，迁移 11–18）

# 运行（-c / --config 缺省就是 config/config.json）
./build/Release/blog.exe -c config/config.json    # Windows：MSVC 是多配置生成器，产物在 Release/ 下
./build/blog -c config/config.json                # 单配置生成器（Ninja / Unix Makefiles）

# 管理员账号要自己造：密码是 PBKDF2+随机盐，没法预先写进 SQL
#   1) 打开 /register 注册一个账号
#   2) 提权：mysql -u root -p blog -e "UPDATE users SET role='admin' WHERE username='<你的用户名>';"
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
    "jwt_secret": "<至少 32 位的随机串，见下方说明>",
    "jwt_expire_seconds": 86400,
    "log_level": "info",
    "log_file": "",
    "trust_proxy_real_ip": false,
    "storage_root": "uploads"
}
```

- `jwt_secret`：**至少 32 位**，且不能是占位串。启动时 `utils/config.cpp` 会校验，太短或命中
  `change-me` / `your-secret` / `placeholder` / `example` 这类占位特征就直接拒绝启动 ——
  HS256 是对称密钥，只要这个值是公开的或可猜的，任何人都能自行签一个 `role=admin` 的 token 进后台。
  生成方式：`openssl rand -hex 32`（Windows 上跑 `start.bat` 会自动生成一份）。
  生产环境建议不放进文件，改用环境变量 `JWT_SECRET`。

- 环境变量覆盖：`DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME`、
  `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD`、`JWT_SECRET` / `JWT_EXPIRE_SECONDS`、
  `CORS_ALLOWED_ORIGIN`（单个）或 `CORS_ALLOWED_ORIGINS`（逗号分隔多个）、`TRUST_PROXY_REAL_IP`。
  环境变量优先于 `config.json`，容器部署时可以完全不写配置文件。

- `storage_root`（默认 `uploads`）：图片 / 视频 / 上传分片的落盘根目录。**相对值按「配置文件所属项目根」解析**，
  不再随进程工作目录变化（以前从 `build/Release` 启动会写到 `build/Release/uploads`，换回仓库根启动就读不到，
  表现为「上传成功但 404」）。要放去别处就写绝对路径，例如 `/var/lib/blog-uploads` 或 `E:/blog/uploads`。

- `trust_proxy_real_ip`（默认 `false`）：后端怎么认定客户端 IP。限流桶和浏览量去重都按这个 IP 计，
  而 `X-Real-IP` / `X-Client-IP` 都是客户端可自带的请求头，所以默认只认 TCP 对端地址。
  只有「Nginx 用 `$remote_addr` 覆写 `X-Real-IP`，且 8089 不直接对外暴露」时才设 `true`
  （或临时用环境变量 `TRUST_PROXY_REAL_IP=true` 覆盖）。跑 `tests/` 下的接口回归必须开它，
  因为脚本靠 `X-Real-IP` 给每个模拟客户端分桶。

> **注意**：`config/config.json` 包含敏感信息，已在 `.gitignore` 中排除，不会被提交到仓库。

### 媒体文件与上传

- 图片落在 `storage_root/images`，公开读取路径是 `GET /api/upload/file/:name`（该路径在鉴权白名单里，
  所以未登录的读者也能看文章配图）。文件名由服务端生成（毫秒时间戳 + 随机 hex），
  读取侧对名字做白名单校验（不含 `/` `\` `..`、长度 ≤128），因此不可能被用来穿越到别的目录。
- **删除会回收文件**：删文章、删用户、自助注销、换头像时，先记下涉及到的图片，删库成功后逐个查
  「还有没有别的内容引用它」（文章封面/正文/标题/摘要、评论内容、他人头像），只为零引用的删掉。
  同一张图被复制进多篇文章是常见操作，所以判定保守：查询失败一律按「仍在引用」处理，宁可留孤儿文件也不误删。
- 视频与投稿支持 HTTP Range（`206` + `Content-Range`，含 `HEAD`、后缀 Range、越界 `416`），
  浏览器拖进度条不会重下整段；分片上传的中间产物 `.part` 按 mtime 超 30 分钟清理（含重启后无人认领的）。

### Docker 部署

```bash
export JWT_SECRET="$(openssl rand -hex 32)"   # 必填，不设就拒绝启动
export DB_PASSWORD="<你的 MySQL root 口令>"      # 不设则退回 compose 里的开发默认值
docker compose up -d --build
```

- **所有宿主机端口映射都只绑回环**：`127.0.0.1` 上的 `8089`（后端）、`3307`/`33061`（MySQL）、
  `6379`（Redis）。容器之间按服务名走 compose 网络、不经过这些映射，所以改绑定不影响后端连接；
  映射只方便在本机用 curl / mysql 客户端调试，同一网段的其它机器连不上任何服务。
- `8089` 尤其不能放开：compose 里开了 `TRUST_PROXY_REAL_IP=true`，谁能直连 8089，谁就能每个请求
  自带一个新的 `X-Real-IP` —— 限流、登录锁定、浏览量去重（都按 IP 分桶）会被整体绕开。
- 仍未收紧的一点：Redis 没有口令，只靠"绑定回环"隔离。若宿主机是多用户共享的，建议再加
  `command: redis-server --requirepass <口令>` 并把 `REDIS_PASSWORD` 传给后端 ——
  JWT 黑名单、限流计数、搜索缓存都在这个库里，能本地连上就等于能清空它们。
- `DB_PASSWORD` 不设时会退回 compose 里写死的开发默认值 `blog123456`，这是**开发便利**，
  正式部署必须自己设一个（`${DB_PASSWORD:?...}` 的写法可参考同一文件里 `JWT_SECRET` 那条）。
- `nginx.conf` 用 `$remote_addr` 覆写 `X-Real-IP`，所以容器里才允许后端认这个头。
- 媒体持久化靠 `./uploads:/app/uploads` 这条挂载；换宿主机目录就改挂载点，别改 `storage_root`。

### 测试与验证

```bash
# 单元测试（不依赖 MySQL/Redis）
cmake --build build --config Release --target blog_tests
./build/Release/blog_tests.exe            # 期望输出 All unit tests passed

# 接口回归：需要先起 MySQL + Redis + 后端
cmake -B build -S . -DBLOG_API_TESTS=ON
cmake --build build --config Release --target blog
TRUST_PROXY_REAL_IP=true ./build/Release/blog.exe --config config/config.json
ctest --test-dir build -C Release -R blog_api --output-on-failure
```

- `ctest` 必须带 `-C Release`（MSVC 是多配置生成器，漏了会报 "Test not available without configuration"）。
- 后端必须以 `TRUST_PROXY_REAL_IP=true` 起：脚本靠自带 `X-Real-IP` 给每个模拟客户端分桶，
  而默认口径不认这个头（那是刻意的，见上文）。没开的话会撞在同一台机器的一个限流桶里报 429。
- 管理员相关用例（后台搜索/排序/趋势、视频审核通知）需要 `BLOG_ADMIN_USERNAME` / `BLOG_ADMIN_PASSWORD`，
  没设时脚本会打印 `skip 管理员用例` 并继续 —— 那是**跳过**，不是通过。
- 另外 `tests/media_reclaim_sql_check.py` 直接对真实 MySQL 校验图片引用计数那条 SQL，不需要起后端。

## API 概览

> 完整且权威的清单在 `src/server/router.cpp` 与各 `register_*_routes`（本表可能滞后，改动以代码为准）。
> 「公开」= 不带 token 也能访问；其余都需要 JWT（`Authorization: Bearer` 或 HttpOnly Cookie `blog_token`）。

| 模块 | 方法与路径 | 认证 |
|------|-----------|------|
| 认证 | `POST /api/auth/register`、`/login`、`/logout` | 公开 |
| | `POST /api/auth/change-password` | JWT |
| | `DELETE /api/users/me`（自助注销，需带密码确认） | JWT |
| 用户 | `GET /api/users/profile`、`GET /api/users/:username` | 公开（未登录时 profile 返回空） |
| | `PUT /api/users/profile`（部分更新） | JWT |
| | `GET`/`PUT /api/users/background` | 公开读 / JWT 写 |
| | `POST`/`DELETE /api/users/:username/follow` | JWT |
| 文章 | `GET /api/posts`、`GET /api/posts/:id` | 公开（按登录态过滤可见性） |
| | `POST /api/posts`、`PUT`/`PATCH /api/posts/:id`、`DELETE /api/posts/:id` | JWT |
| | `GET /api/posts/mine`、`/liked`、`/bookmarked` | JWT（中间件对 `GET /api/posts/*` 放行，由控制器校验） |
| | `POST`/`DELETE /api/posts/:id/like`、`/bookmark` | JWT |
| 评论 | `GET /api/posts/:id/comments`、`POST /api/posts/:id/comments` | 读公开 / 写需 JWT |
| | `DELETE /api/comments/:id`（作者本人或管理员） | JWT |
| 标签与搜索 | `GET /api/tags`、`GET /api/tags/:id/posts`、`GET /api/search?q=` | 公开 |
| 通知 | `GET /api/notifications`、`PUT /api/notifications/:id/read`、`/read-all`、`DELETE /api/notifications/:id` | JWT |
| 图片 | `POST /api/upload/image` | JWT |
| | `GET /api/upload/file/:name` | 公开 |
| 视频 | `GET /api/videos/active`、`GET`/`HEAD /api/videos/file/:name` | 公开（支持 Range） |
| | `POST /api/videos/upload/init`、`PUT`/`GET /api/videos/upload/:id`、`POST …/complete`、`DELETE /api/videos/upload/:id` | JWT（分片上传支持断点续传） |
| | `GET /api/videos/mine`、`DELETE /api/videos/:id` | JWT |
| 留言 | `POST /api/contact` | 公开 |
| 后台 | `GET /api/admin/users`、`/posts`、`/comments`、`/contacts`、`/videos`、`/stats`、`/stats/trend` | 管理员 |
| | `PUT /api/admin/users/:id/role`、`DELETE /api/admin/{users,posts,comments,contacts}/:id`、`PUT /api/videos/:id/{status,active}` | 管理员 |

几个语义要点：

- **部分更新**：`PUT` 与 `PATCH /api/posts/:id` 是同一个 handler，`PUT /api/users/profile` 同理。
  字段缺省＝不动，出现且为空串＝显式清空，`null` 视为缺省，非法枚举 400，空 body 400，id 不存在 404。
- **分页**：所有列表接口都接受 `page` / `page_size` 并夹紧（`page ≥ 1`、`1 ≤ page_size ≤ 100`，
  超出上界按「翻到头」返回空列表），排序并列时以主键兜底保证翻页不重不漏。
  返回结构带 `total`；评论是 `{comments,total,page,page_size}`，通知是 `{notifications,total,page,page_size,unread_count}`
  （`unread_count` 跨页统计，前端角标用它，不能用当前页条数）。
- **登录失败锁定**：按「来源 IP + 用户名」5 次/30 分钟锁该来源，另按「用户名」30 分钟累计 20 次锁账号，
  避免旁人拿别人的用户名连错几次就把真号主挡在门外。
- **限流**：按归一后的客户端 IP 分桶（`utils/client_ip.h`）；默认只认 TCP 对端，
  代理场景才用 `trust_proxy_real_ip` 认 `X-Real-IP`。

