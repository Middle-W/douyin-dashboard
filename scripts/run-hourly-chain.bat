@echo off
:: 串联执行：先抖川 → 完成后抖老板（每小时的 03 分运行）

:: 检查并启动 dev server
netstat -an | find "3000" | find "LISTENING" >nul
if %errorlevel% neq 0 (
    echo [串联任务] 本地服务未运行，正在启动...
    start /min cmd /c "cd /d ""C:\Users\W\Desktop\Kimi Code\douyin-dashboard\nextjs-app"" && ""C:\Program Files\nodejs\npm.cmd"" run dev"
    timeout /t 25 /nobreak >nul
    echo [串联任务] 等待服务启动完成
)

cd /d "C:\Users\W\Desktop\Kimi Code\douyin-dashboard\scripts"
set HEADLESS=true

echo.
echo [串联任务] ========== 1/2 抖川采集 ==========
set API_URL=http://localhost:3000/api/import-cost-json
"C:\Program Files\nodejs\node.exe" fetch-douchuan-hourly.js
if %errorlevel% neq 0 (
    echo [串联任务] ⚠️ 抖川采集失败，跳过抖老板
    exit /b 1
)

echo.
echo [串联任务] ========== 2/2 抖老板采集 ==========
set API_URL=http://localhost:3000/api/import-daily-stats
"C:\Program Files\nodejs\node.exe" fetch-douboss-hourly.js
if %errorlevel% neq 0 (
    echo [串联任务] ⚠️ 抖老板采集失败
    exit /b 1
)

echo.
echo [串联任务] ✅ 全部完成
