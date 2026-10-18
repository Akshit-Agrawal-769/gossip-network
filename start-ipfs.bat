@echo off
REM Starts this device's IPFS node. Keep this window open while using Relay.
cd /d %~dp0
if not exist ipfs.exe (
  echo ipfs.exe was not found in this folder. Download Kubo and place ipfs.exe here.
  pause
  exit /b 1
)
if not exist "%USERPROFILE%\.ipfs\config" ipfs.exe init
ipfs.exe config --json Pubsub.Enabled true
echo.
echo Starting IPFS. When it shows "Daemon is ready", run start-relay.bat.
echo.
ipfs.exe daemon
pause
