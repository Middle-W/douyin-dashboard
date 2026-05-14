@echo off
echo ============ douchuan-daily started ============ >> C:\temp\douyin-logs\douchuan-daily.log

netstat -an | findstr "3000" | findstr "LISTENING" >nul
if %errorlevel% neq 0 (
    echo dev server not running, starting... >> C:\temp\douyin-logs\douchuan-daily.log
    start /min cmd /c "cd /d ""C:\Users\W\Desktop\Kimi Code\douyin-dashboard\nextjs-app"" && ""C:\Program Files\nodejs\npm.cmd"" run dev"
    ping -n 26 127.0.0.1 >nul
    echo dev server started >> C:\temp\douyin-logs\douchuan-daily.log
)

cd /d "C:\Users\W\Desktop\Kimi Code\douyin-dashboard\scripts"
set API_URL=http://localhost:3000/api/import-cost-json
set HEADLESS=true
"C:\Program Files\nodejs\node.exe" fetch-douchuan.js >> C:\temp\douyin-logs\douchuan-daily.log 2>&1
echo exit code: %errorlevel% >> C:\temp\douyin-logs\douchuan-daily.log
