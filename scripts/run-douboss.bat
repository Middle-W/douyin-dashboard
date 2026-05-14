@echo off
echo ============ douboss-daily started ============ >> C:\temp\douyin-logs\douboss-daily.log

netstat -an | findstr "3000" | findstr "LISTENING" >nul
if %errorlevel% neq 0 (
    echo dev server not running, starting... >> C:\temp\douyin-logs\douboss-daily.log
    start /min cmd /c "cd /d ""C:\Users\W\Desktop\Kimi Code\douyin-dashboard\nextjs-app"" && ""C:\Program Files\nodejs\npm.cmd"" run dev < nul"
    ping -n 31 127.0.0.1 >nul
    netstat -an | findstr "3000" | findstr "LISTENING" >nul
    if %errorlevel% neq 0 (
        echo dev server still not running, retry... >> C:\temp\douyin-logs\douboss-daily.log
        start /min cmd /c "cd /d ""C:\Users\W\Desktop\Kimi Code\douyin-dashboard\nextjs-app"" && ""C:\Program Files\nodejs\npm.cmd"" run dev < nul"
        ping -n 31 127.0.0.1 >nul
    )
    echo dev server started >> C:\temp\douyin-logs\douboss-daily.log
)

cd /d "C:\Users\W\Desktop\Kimi Code\douyin-dashboard\scripts"
set API_URL=http://localhost:3000/api/import-daily-stats
set HEADLESS=true
"C:\Program Files\nodejs\node.exe" fetch-douboss.js >> C:\temp\douyin-logs\douboss-daily.log 2>&1
echo exit code: %errorlevel% >> C:\temp\douyin-logs\douboss-daily.log
