@echo off
REM Starts the Relay web app. Run this after start-ipfs.bat shows "Daemon is ready".
cd /d %~dp0
set /p NODE_NAME=Name for this device (press Enter to use the computer name):
if "%NODE_NAME%"=="" set NODE_NAME=%COMPUTERNAME%
node server.js
pause
