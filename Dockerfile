# ============================================================================
# 多阶段构建：C++ 后端
# ============================================================================
FROM ubuntu:24.04 AS backend-builder

ENV DEBIAN_FRONTEND=noninteractive

# @cuiruoni+安装编译依赖（Ubuntu 24.04 自带 Boost 1.83，满足项目需求）
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential ca-certificates cmake curl git pkg-config \
    libboost1.83-dev libssl-dev libhiredis-dev \
    ninja-build zip unzip \
    && rm -rf /var/lib/apt/lists/*

# @cuiruoni+安装 vcpkg 依赖（jwt-cpp, cmark, mysql-connector-cpp）
# @crnl+F10：补 spdlog 与 hiredis——CMakeLists 对二者都是 find_package(CONFIG REQUIRED)，
# apt 的 libhiredis-dev 不带 CMake config 包，缺了全新构建 configure 必失败
RUN git clone --depth 1 https://github.com/microsoft/vcpkg.git /opt/vcpkg \
    && /opt/vcpkg/bootstrap-vcpkg.sh -disableMetrics \
    && /opt/vcpkg/vcpkg install \
        jwt-cpp cmark mysql-connector-cpp spdlog hiredis \
        --triplet x64-linux \
    && rm -rf /opt/vcpkg/buildtrees /opt/vcpkg/downloads

ENV VCPKG_ROOT=/opt/vcpkg

WORKDIR /build
COPY CMakeLists.txt .
COPY src/ src/
COPY sql/ sql/
# @crnl+F10：CMakeLists 的 blog_tests 目标引用 tests/unit_tests.cpp，不拷则 configure 失败
COPY tests/ tests/

RUN cmake -B build -DCMAKE_BUILD_TYPE=Release \
    && cmake --build build -j$(nproc)

# ============================================================================
# 运行阶段
# ============================================================================
FROM ubuntu:24.04 AS runtime

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    libssl3 libhiredis1.1.0 \
    libboost-system1.83.0 libboost-filesystem1.83.0 \
    libboost-thread1.83.0 libboost-program-options1.83.0 \
    libboost-json1.83.0 \
    && rm -rf /var/lib/apt/lists/*

# @cuiruoni+从构建阶段复制可执行文件和 vcpkg 运行时库
COPY --from=backend-builder /build/build/blog /app/blog
COPY --from=backend-builder /opt/vcpkg/installed/x64-linux/lib/*.so* /usr/local/lib/
RUN ldconfig

# @crnl+F10：不再 COPY config/——该目录被 gitignore，全新克隆里是空的（构建失败），
# 本机构建又会把真实口令/密钥烘进镜像。改为运行时挂载（compose 已挂 ./config），
# 未挂载时 entrypoint 生成空 JSON，靠 DB_HOST/JWT_SECRET 等环境变量注入；
# JWT_SECRET 缺失/占位会被启动守卫拒绝（fail-closed）
RUN mkdir -p /app/config \
    && printf '#!/bin/sh\nif [ ! -f config/config.json ]; then echo "{}" > config/config.json; fi\nexec ./blog -c config/config.json\n' > /app/entrypoint.sh \
    && chmod +x /app/entrypoint.sh
COPY sql/ /app/sql/

WORKDIR /app
EXPOSE 8089

CMD ["/app/entrypoint.sh"]

# ============================================================================
# 前端构建阶段（单独使用：docker build --target frontend-builder .）
# ============================================================================
FROM node:20-alpine AS frontend-builder

WORKDIR /build
# @cuiruoni+package-lock.json已被gitignore，全新克隆不存在，使用npm install保证可构建
COPY source/frontend-source/package.json ./
RUN npm install
COPY source/frontend-source/ ./
RUN npm run build

# @cuiruoni+前端产物在 /build/dist，由 Nginx 或后端静态文件服务提供

# ============================================================================
# 前端运行阶段（compose 使用）
# @crnl+F10：原先 compose 挂宿主机 dist/（被 gitignore），全新克隆起 nginx 是空站点。
# 这里直接把构建产物烘进 nginx 镜像，docker compose up 不再依赖手工 npm build
# ============================================================================
FROM nginx:alpine AS frontend
COPY --from=frontend-builder /build/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
