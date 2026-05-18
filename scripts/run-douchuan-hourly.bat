@echo off
:: 抖川小时级采集 - 公司版（每小时的 35 分运行）
:: 推送到公司服务器

cd /d "C:\Users\W\Desktop\Kimi Code\douyin-dashboard-company\scripts"
set API_URL=http://150.109.158.191:3000/api/import-cost-json
set HEADLESS=true
"C:\Program Files\nodejs\node.exe" fetch-douchuan-hourly.js
