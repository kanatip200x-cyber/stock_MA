@echo off
REM Upload to GitHub once.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0auto-push.ps1" -Once
pause
