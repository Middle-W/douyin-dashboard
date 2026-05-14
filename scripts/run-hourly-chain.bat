@echo off
echo ============ hourly-chain started ============ >> C:\temp\douyin-logs\hourly-chain.log

netstat -an | findstr "3000" | findstr "LISTENING" >nul
if %errorlevel% neq 0 (
    echo dev server not running, starting... >> C:\temp\douyin-logs\hourly-chain.log
    powershell -WindowStyle Hidden -Command "Start-Process -FilePath 'C:\Program Files\nodejs\npm.cmd' -ArgumentList 'run','dev' -WorkingDirectory 'C:\Users\W\Desktop\Kimi Code\douyin-dashboard\nextjs-app' -WindowStyle Hidden"
    ping -n 31 127.0.0.1 >nul
    netstat -an | findstr "3000" | findstr "LISTENING" >nul
    if %errorlevel% neq 0 (
        echo dev server still not running, retry... >> C:\temp\douyin-logs\hourly-chain.log
        powershell -WindowStyle Hidden -Command "Start-Process -FilePath 'C:\Program Files\nodejs\npm.cmd' -ArgumentList 'run','dev' -WorkingDirectory 'C:\Users\W\Desktop\Kimi Code\douyin-dashboard\nextjs-app' -WindowStyle Hidden"
        ping -n 31 127.0.0.1 >nul
    )
    echo dev server started >> C:\temp\douyin-logs\hourly-chain.log
)

cd /d "C:\Users\W\Desktop\Kimi Code\douyin-dashboard\scripts"
set HEADLESS=true

echo step 1/2 douchuan >> C:\temp\douyin-logs\hourly-chain.log
set API_URL=http://localhost:3000/api/import-cost-json
"C:\Program Files\nodejs\node.exe" fetch-douchuan-hourly.js >> C:\temp\douyin-logs\hourly-chain.log 2>&1
if %errorlevel% neq 0 (
    echo douchuan failed, skip douboss >> C:\temp\douyin-logs\hourly-chain.log
    exit /b 1
)

echo step 2/2 douboss >> C:\temp\douyin-logs\hourly-chain.log
set API_URL=http://localhost:3000/api/import-daily-stats
"C:\Program Files\nodejs\node.exe" fetch-douboss-hourly.js >> C:\temp\douyin-logs\hourly-chain.log 2>&1
if %errorlevel% neq 0 (
    echo douboss failed >> C:\temp\douyin-logs\hourly-chain.log
    exit /b 1
)

echo all done >> C:\temp\douyin-logs\hourly-chain.log
