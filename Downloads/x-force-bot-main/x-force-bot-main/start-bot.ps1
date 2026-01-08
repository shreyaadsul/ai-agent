# WhatsApp Attendance Bot Startup Script (PowerShell)
# Run this to start the entire bot setup

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "WhatsApp Attendance Bot Startup" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

# Stop any existing processes
Write-Host "Stopping any existing processes..." -ForegroundColor Yellow
taskkill /F /IM node.exe 2>$null | Out-Null
taskkill /F /IM ngrok.exe 2>$null | Out-Null
Start-Sleep -Seconds 2

# Get the script directory
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

# Start Node.js server
Write-Host "Starting Node.js server..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "node .\server.js" -WindowStyle Normal

Start-Sleep -Seconds 3

# Start ngrok
Write-Host "Starting ngrok tunnel..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "ngrok http 3000" -WindowStyle Normal

Start-Sleep -Seconds 2

# Display status
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "✅ Bot is starting!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Server:  http://localhost:3000" -ForegroundColor Yellow
Write-Host "Webhook: https://uninvective-incorrigibly-warren.ngrok-free.dev/attendance_callbackurl" -ForegroundColor Yellow
Write-Host "Verify Token: 123" -ForegroundColor Yellow
Write-Host ""
Write-Host "Keep the windows open to receive WhatsApp messages!" -ForegroundColor Green
Write-Host ""

# Keep script window open
Read-Host "Press Enter to exit this window (bot will continue running)"
