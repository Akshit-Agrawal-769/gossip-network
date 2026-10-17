@echo off
REM Starts this laptop's IPFS node (keep this window open!)
cd /d %~dp0
if not exist ipfs.exe (
  echo ipfs.exe not found in this folder. Download Kubo and put ipfs.exe here.
  pause
  exit /b 1
)
if not exist "%USERPROFILE%\.ipfs\config" ipfs.exe init
ipfs.exe config --json Pubsub.Enabled true
echo.
echo Starting IPFS... wait for "Daemon is ready", then run start-aunty.bat
echo.
ipfs.exe daemon
pause
