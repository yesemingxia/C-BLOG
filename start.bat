@echo off
setlocal EnableDelayedExpansion

echo ============================================
echo    cpp-blog - One-Click Start Script
echo ============================================
echo.

:: -- Project root --
set "ROOT=%~dp0"
set "ROOT=%ROOT:~0,-1%"

:: -- 1. Check dependencies --
echo [1/5] Checking dependencies...

where cmake >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] cmake not found, please install it first
    goto :fail
)

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] node not found, please install it first
    goto :fail
)

where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] npm not found, please install it first
    goto :fail
)

echo       cmake, node, npm are ready

:: -- 2. Locate or create config file --
echo.
echo [2/5] Checking config file...

:: @cuiruoni+先生成一个够长的 jwt_secret，供「本机还没有配置」时新建配置用。
:: @cuiruoni+长度下限必须和 utils/config.cpp 的守卫一致（至少 32 位）：原先这里固定拼 4 个
:: @cuiruoni+%RANDOM%（每个 1~5 位，合计 13~29 位），守卫一收紧，第一次用 start.bat 起服务的人
:: @cuiruoni+就会直接被拒绝启动 —— 而报错信息指向的是配置文件，可他根本没写过这个文件。
:: @cuiruoni+循环到长度超过 32 为止（取第 33 个字符判空）。
set "GEN_SECRET=cpp-blog-"
:gensecret_loop
set "GEN_SECRET=!GEN_SECRET!!RANDOM!!RANDOM!"
if "!GEN_SECRET:~32,1!"=="" goto gensecret_loop

set "CONFIG_PATH="

if exist "%ROOT%\config\config.json" (
    set "CONFIG_PATH=%ROOT%\config\config.json"
    echo       Using config\config.json
) else if exist "%ROOT%\build\Release\config\config.json" (
    set "CONFIG_PATH=%ROOT%\build\Release\config\config.json"
    echo       Using build\Release\config\config.json
) else (
    if not exist "%ROOT%\config" mkdir "%ROOT%\config"
    echo       Creating default config\config.json
    >"%ROOT%\config\config.json" (
        echo {
        echo   "server_host": "0.0.0.0",
        echo   "server_port": 8089,
        echo   "db_host": "127.0.0.1",
        echo   "db_port": 33060,
        echo   "db_user": "root",
        echo   "db_password": "",
        echo   "db_name": "blog",
        echo   "db_pool_size": 4,
        echo   "redis_host": "127.0.0.1",
        echo   "redis_port": 6379,
        echo   "redis_password": "",
        echo   "redis_pool_size": 4,
        echo   "jwt_secret": "!GEN_SECRET!",
        echo   "jwt_expire_seconds": 86400,
        echo   "log_level": "info",
        echo   "log_file": ""
        echo }
    )
    set "CONFIG_PATH=%ROOT%\config\config.json"
    echo [HINT] Please edit config\config.json to match your MySQL and Redis settings
    echo [HINT] For anything beyond local testing, replace jwt_secret with your own random
    echo        value ^(e.g. openssl rand -hex 32^) or set the JWT_SECRET environment variable -
    echo        the one written above comes from the weak batch %%RANDOM%% generator.
)

:: -- 3. Build C++ backend (skip if already built) --
echo.
echo [3/5] Checking C++ backend...

set "BUILD_DIR=%ROOT%\build"
set "BACKEND_EXE=%BUILD_DIR%\Release\blog.exe"

if exist "%BACKEND_EXE%" (
    echo       Backend executable found, skipping build
) else (
    if not exist "%BUILD_DIR%" mkdir "%BUILD_DIR%"

    echo       Running CMake configure...
    cmake -S "%ROOT%" -B "%BUILD_DIR%" -D CMAKE_BUILD_TYPE=Release
    if !errorlevel! neq 0 (
        echo [ERROR] CMake configure failed
        goto :fail
    )

    echo       Building backend...
    cmake --build "%BUILD_DIR%" --config Release
    if !errorlevel! neq 0 (
        echo [ERROR] C++ backend build failed
        goto :fail
    )

    echo       Backend built successfully
)

:: -- 4. Install frontend dependencies --
echo.
echo [4/5] Installing frontend dependencies...

cd /d "%ROOT%\source\frontend-source"

if not exist "node_modules" (
    echo       Installing npm packages...
    npm install
    if !errorlevel! neq 0 (
        echo [ERROR] Frontend dependency install failed
        cd /d "%ROOT%"
        goto :fail
    )
) else (
    echo       node_modules already exists, skipping install
)

cd /d "%ROOT%"

:: -- 5. Start services --
echo.
echo [5/5] Starting services...

:: Start backend
echo       Starting backend server...
start "cpp-blog-backend" cmd /k "cd /d "%BUILD_DIR%\Release" && blog.exe --config "!CONFIG_PATH!""

:: Wait for backend to initialize
timeout /t 3 /nobreak >nul

:: Start frontend
echo       Starting frontend dev server...
cd /d "%ROOT%\source\frontend-source"
start "cpp-blog-frontend" cmd /k "npm run dev"
cd /d "%ROOT%"

echo.
echo ============================================
echo    Started successfully!
echo    Backend:  http://localhost:8089
echo    Frontend: http://localhost:5173
echo ============================================
echo.
echo Press any key to exit this window
echo (services will keep running in separate windows)...
pause >nul
goto :end

:fail
echo.
echo [FAILED] Please check the errors above
pause
exit /b 1

:end
endlocal
