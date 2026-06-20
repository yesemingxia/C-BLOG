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
RUN git clone --depth 1 https://github.com/microsoft/vcpkg.git /opt/vcpkg \
    && /opt/vcpkg/bootstrap-vcpkg.sh -disableMetrics \
    && /opt/vcpkg/vcpkg install \
        jwt-cpp cmark mysql-connector-cpp \
        --triplet x64-linux \
    && rm -rf /opt/vcpkg/buildtrees /opt/vcpkg/downloads

ENV VCPKG_ROOT=/opt/vcpkg

WORKDIR /build
COPY CMakeLists.txt .
COPY src/ src/
COPY sql/ sql/

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

COPY config/ /app/config/
COPY sql/ /app/sql/

WORKDIR /app
EXPOSE 8089

CMD ["./blog", "-c", "config/config.json"]

# ============================================================================
# 前端构建阶段（单独使用：docker build -f Dockerfile.frontend .）
# ============================================================================
FROM node:20-alpine AS frontend-builder

WORKDIR /build
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# @cuiruoni+前端产物在 /build/dist，由 Nginx 或后端静态文件服务提供
