@echo off
setlocal
title Tatto Studio
if not exist "%~dp0runtime\python\python.exe" (
  echo The bundled Python runtime is missing. Extract the complete Tatto Studio package.
  pause
  exit /b 1
)
"%~dp0runtime\python\python.exe" -B "%~dp0launcher.py" stop
if errorlevel 1 (
  echo.
  echo Tatto Studio could not complete this operation. See the message above.
  pause
  exit /b 1
)
endlocal
