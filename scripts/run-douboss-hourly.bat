@echo off
:: 抖老板小时级采集 - 公司版（每小时的 05 分运行）
:: 推送到公司服务器

cd /d "C:\Users\W\Desktop\Kimi Code\douyin-dashboard-company\scripts"
set API_URL=http://150.109.158.191:3000/api/import-daily-stats
set HEADLESS=true
"C:\Program Files\nodejs\node.exe" fetch-douboss-hourly.js
