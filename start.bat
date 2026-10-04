@echo off
REM ===== Njuguna Content Engine launcher (Windows) =====
REM 1) Edit YOUR-NGROK-DOMAIN below (e.g. cool-name-123.ngrok-free.app)
REM 2) Double-click this file. Two windows open: the tunnel and the engine.
REM    Keep both open. Closing them stops the autopilot.

cd /d "%~dp0"
start "ngrok tunnel" cmd /k ngrok http --url=YOUR-NGROK-DOMAIN 3000
timeout /t 4 >nul
start "content engine" cmd /k npm start
