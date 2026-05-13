@echo off
set LOGDIR=C:\Users\W\Desktop\Kimi Code\douyin-dashboard\scripts\logs
if not exist "%LOGDIR%" mkdir "%LOGDIR%"
>> "%LOGDIR%\douboss-daily.log" 2>&1 (
  echo ============================================
  echo [%date% %time%] 抖老板日采集任务启动

  :: Check if localhost:3000 is already running
  netstat -an | find "3000" | find "LISTENING" >nul
  if %errorlevel% neq 0 (
      echo [%date% %time%] 本地服务未运行，正在启动...
      start /min cmd /c "cd /d ""C:\Users\W\Desktop\Kimi Code\douyin-dashboard\nextjs-app"" && ""C:\Program Files\nodejs\npm.cmd"" run dev"
      ping -n 26 127.0.0.1 >nul
      echo [%date% %time%] 等待服务启动完成
  )

  cd /d "C:\Users\W\Desktop\Kimi Code\douyin-dashboard\scripts"
  set API_URL=http://localhost:3000/api/import-daily-stats
  set HEADLESS=true
  "C:\Program Files\nodejs\node.exe" fetch-douboss.js
  echo [%date% %time%] 任务结束，返回码: %errorlevel%
)
