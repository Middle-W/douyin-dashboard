@echo off
chcp 65001 >nul
echo ==========================================
echo   抖音数据看板 - 本地启动脚本
echo ==========================================
echo.

REM 检查 Node.js
node -v >nul 2>&1
if errorlevel 1 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js 18+ LTS
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)

echo [1/3] Node.js 版本:
node -v
echo.

REM 安装前端依赖（如果还没装）
if not exist "nextjs-app\node_modules" (
    echo [2/3] 安装前端依赖...
    cd nextjs-app
    call npm install
    cd ..
) else (
    echo [2/3] 前端依赖已安装，跳过
)

REM 安装脚本依赖（如果还没装）
if not exist "scripts\node_modules" (
    echo [3/3] 安装脚本依赖...
    cd scripts
    call npm install
    cd ..
) else (
    echo [3/3] 脚本依赖已安装，跳过
)

echo.
echo ==========================================
echo   启动前端开发服务器...
echo   浏览器访问: http://localhost:3000
echo ==========================================
echo.

cd nextjs-app
npm run dev
