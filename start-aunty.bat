@echo off
REM Starts the Aunty Network web app (run AFTER start-ipfs.bat says "Daemon is ready")
cd /d %~dp0
set /p AUNTY_NAME=Which aunty is this laptop? (e.g. Sharma Aunty):
if "%AUNTY_NAME%"=="" set AUNTY_NAME=Sharma Aunty
node server.js
pause
