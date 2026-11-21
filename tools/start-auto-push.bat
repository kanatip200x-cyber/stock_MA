@echo off
REM Auto-upload to GitHub. Close this window to stop.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0auto-push.ps1"
pause
