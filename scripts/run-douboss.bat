@echo off
:: Check if localhost:3000 is already running
netstat -an | find "3000" | find "LISTENING" >nul
if %errorlevel% neq 0 (
    echo [定时任务] 本地服务未运行，正在启动...
    start /min cmd /c "cd /d ""C:\Users\W\Desktop\Kimi Code\douyin-dashboard\nextjs-app"" && npm run dev"
    timeout /t 25 /nobreak >nul
    echo [定时任务] 等待服务启动完成
)

cd /d "C:\Users\W\Desktop\Kimi Code\douyin-dashboard\scripts"
set API_URL=http://localhost:3000
node fetch-douboss.js
