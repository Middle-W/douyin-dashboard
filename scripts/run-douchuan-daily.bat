@echo off
:: 抖川昨日消耗采集 - 公司版（每天早上7:30运行）
:: 采集昨天全天消耗数据

cd /d "C:\Users\W\Desktop\Kimi Code\douyin-dashboard-company\scripts"

:: 获取昨天日期 yyyy-MM-dd
for /f "usebackq" %%a in (`powershell -Command "(Get-Date).AddDays(-1).ToString('yyyy-MM-dd')"`) do set YESTERDAY=%%a

echo [%date% %time%] Fetching Douchuan data for %YESTERDAY% (company)

set API_URL=http://150.109.158.191:3000/api/import-cost-json
set HEADLESS=true
set FETCH_DATE=%YESTERDAY%

"C:\Program Files\nodejs\node.exe" fetch-douchuan-hourly.js

if %errorlevel% neq 0 (
    echo [%date% %time%] FAILED
    exit /b 1
)

echo [%date% %time%] SUCCESS
