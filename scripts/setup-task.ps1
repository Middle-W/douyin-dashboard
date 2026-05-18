$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument '/c "C:\Users\W\Desktop\Kimi Code\douyin-dashboard-company\scripts\run-douchuan-daily.bat"'
$trigger = New-ScheduledTaskTrigger -Daily -At '07:30'
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
Register-ScheduledTask -TaskName 'Douyin-Douchuan-Daily-Company' -Action $action -Trigger $trigger -Settings $settings -Force -Description '公司版抖川昨日消耗采集，每天7:30执行'
Write-Host 'Task created successfully'
