@echo off
REM WhatsApp Attendance Bot Startup Script
REM This script starts both the Node.js server and ngrok tunnel

echo.
echo ========================================
echo WhatsApp Attendance Bot Startup
echo ========================================
echo.

REM Get the current directory
cd /d "%~dp0"

REM Kill any existing processes
echo Stopping any existing processes...
taskkill /F /IM node.exe >nul 2>&1
taskkill /F /IM ngrok.exe >nul 2>&1
timeout /t 2 /nobreak >nul

REM Start Node.js server in a new window
echo Starting Node.js server...
start "WhatsApp Bot Server" cmd /k "node .\server.js"
timeout /t 3 /nobreak >nul

REM Start ngrok in a new window
echo Starting ngrok tunnel...
start "ngrok Tunnel" cmd /k "ngrok http 3000"

REM Display status
echo.
echo ========================================
echo ✅ Bot is starting!
echo ========================================
echo.
echo Server:  http://localhost:3000
echo Webhook: https://uninvective-incorrigibly-warren.ngrok-free.dev/attendance_callbackurl
echo Verify Token: 123
echo.
echo Keep these windows open to receive WhatsApp messages.
echo.
pause
