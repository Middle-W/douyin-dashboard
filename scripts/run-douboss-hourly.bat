@echo off
:: 抖老板小时级采集 - 当天数据（每小时的 05 分运行）
:: Check if localhost:3000 is already running
netstat -an | find "3000" | find "LISTENING" >nul
if %errorlevel% neq 0 (
    echo [定时任务] 本地服务未运行，正在启动...
    start /min cmd /c "cd /d ""C:\Users\W\Desktop\Kimi Code\douyin-dashboard\nextjs-app"" && ""C:\Program Files\nodejs\npm.cmd"" run dev"
    timeout /t 25 /nobreak >nul
    echo [定时任务] 等待服务启动完成
)

cd /d "C:\Users\W\Desktop\Kimi Code\douyin-dashboard\scripts"
set API_URL=http://localhost:3000/api/import-daily-stats
"C:\Program Files\nodejs\node.exe" fetch-douboss-hourly.js
