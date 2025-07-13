Write-Host "📊 Status Bot Mandacaru" -ForegroundColor Blue
Get-Process node -ErrorAction SilentlyContinue | Format-Table
if (Test-Path "logs\*.log") { 
    Write-Host "Logs recentes:" -ForegroundColor Yellow
    Get-Content "logs\*.log" -Tail 5 -ErrorAction SilentlyContinue
}
