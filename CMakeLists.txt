cmake_minimum_required(VERSION 3.20)

set(CMAKE_POLICY_DEFAULT_CMP0144 NEW)
set(CMAKE_POLICY_DEFAULT_CMP0167 NEW)

project(cpp-blog LANGUAGES CXX)

set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# ============================================================================
# vcpkg 自动检测：优先使用环境变量VCPKG_ROOT，回退到默认路径
# ============================================================================
if(NOT CMAKE_TOOLCHAIN_FILE)
    if(DEFINED ENV{VCPKG_ROOT})
        set(VCPKG_ROOT "$ENV{VCPKG_ROOT}")
    else()
        set(VCPKG_ROOT "D:/vcpkg-master")
    endif()
    if(EXISTS "${VCPKG_ROOT}/scripts/buildsystems/vcpkg.cmake")
        set(CMAKE_TOOLCHAIN_FILE "${VCPKG_ROOT}/scripts/buildsystems/vcpkg.cmake")
        message(STATUS "Using vcpkg toolchain: ${CMAKE_TOOLCHAIN_FILE}")
    endif()
endif()

# 确保 vcpkg 安装目录在搜索路径中
if(EXISTS "${VCPKG_ROOT}/installed/x64-windows")
    list(APPEND CMAKE_PREFIX_PATH "${VCPKG_ROOT}/installed/x64-windows")
endif()

# 消除 Boost 1.88 的 FindBoost 策略警告
cmake_policy(SET CMP0144 NEW)
cmake_policy(SET CMP0167 NEW)
set(Boost_NO_WARN_NEW_VERSION ON)

# ============================================================================  
# Boost：优先使用环境变量BOOST_ROOT，回退到默认路径
# Beast 是 header-only，只需头文件路径，不需要链接
# 需要链接的模块：system filesystem thread program_options json
# ============================================================================  
if(DEFINED ENV{BOOST_ROOT} AND EXISTS "$ENV{BOOST_ROOT}")
    set(BOOST_ROOT "$ENV{BOOST_ROOT}")
elseif(EXISTS "D:/boost_1_88_0")
    set(BOOST_ROOT "D:/boost_1_88_0")
endif()

if(BOOST_ROOT)
    set(Boost_NO_SYSTEM_PATHS ON)
    set(Boost_DIR "${BOOST_ROOT}/stage/lib/cmake/Boost-1.88.0" CACHE PATH "Boost cmake config directory")
else()
    set(Boost_NO_SYSTEM_PATHS OFF)
endif()

find_package(Boost 1.75 REQUIRED COMPONENTS
    system filesystem thread program_options json
)

# ============================================================================
# vcpkg 管理的库（D:\vcpkg-master\installed\x64-windows）
# ============================================================================

# jwt-cpp — JWT Token 生成/验证（header-only，依赖 OpenSSL）
find_package(jwt-cpp CONFIG REQUIRED)

# cmark — Markdown 转 HTML
find_package(cmark CONFIG REQUIRED)

# mysql-connector-cpp — MySQL 驱动（X DevAPI）
# target: unofficial::mysql-connector-cpp::connector
find_package(unofficial-mysql-connector-cpp CONFIG REQUIRED)

# OpenSSL — JWT 签名 + HTTPS + 密码哈希(PBKDF2)
# 注：bcrypt 未安装在 vcpkg 中，密码哈希改用 OpenSSL 的 PKCS5_PBKDF2_HMAC
find_package(OpenSSL REQUIRED)

# spdlog — 高性能日志
find_package(spdlog CONFIG REQUIRED)

# hiredis — Redis C 客户端
# 注：redis-plus-plus 未安装，直接使用 hiredis C API
find_package(hiredis CONFIG REQUIRED)

# ============================================================================
# 项目源文件
# ============================================================================
file(GLOB_RECURSE SOURCES "src/*.cpp")
add_executable(blog ${SOURCES})

target_include_directories(blog PRIVATE
    ${CMAKE_SOURCE_DIR}/src
)

# ============================================================================
# 链接库
# ============================================================================
target_link_libraries(blog PRIVATE
    # Boost
    Boost::system
    Boost::filesystem
    Boost::thread
    Boost::program_options
    Boost::json
    # vcpkg
    jwt-cpp::jwt-cpp
    cmark::cmark
    unofficial::mysql-connector-cpp::connector
    OpenSSL::SSL
    OpenSSL::Crypto
    spdlog::spdlog
    hiredis::hiredis
)

# ============================================================================
# Windows 平台额外依赖
# ============================================================================
if(WIN32)
    target_compile_definitions(blog PRIVATE _WIN32_WINNT=0x0601)
    target_link_libraries(blog PRIVATE ws2_32 crypt32)
endif()

# ============================================================================
# 统一 UTF-8 编译选项：源码含中文注释，GBK 代码页下会破坏编译
# ============================================================================
if(MSVC)
    target_compile_options(blog PRIVATE /utf-8)
endif()

# ============================================================================
# 单元测试（P1修复：纯逻辑测试，不依赖MySQL/Redis）
# ============================================================================
enable_testing()

add_executable(blog_tests
    tests/unit_tests.cpp
    src/utils/response.cpp
    src/utils/password.cpp
)

target_include_directories(blog_tests PRIVATE
    ${CMAKE_SOURCE_DIR}/src
)

target_link_libraries(blog_tests PRIVATE
    Boost::json
    OpenSSL::Crypto
)

if(WIN32)
    target_compile_definitions(blog_tests PRIVATE _WIN32_WINNT=0x0601)
endif()

if(MSVC)
    target_compile_options(blog_tests PRIVATE /utf-8)
endif()

add_test(NAME blog_unit_tests COMMAND blog_tests)
