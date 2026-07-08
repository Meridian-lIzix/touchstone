@echo off
title Touchstone Launcher
echo Starting Touchstone launcher...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0touchstone-launch.ps1"
echo.
echo Press any key to close this window...
pause >nul
