@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set "OKUSURI_DEV=1"

rem Guard: CMD cannot use UNC path as current directory
echo %CD% | findstr /b "\\\\" >nul
if %errorlevel%==0 (
  echo [ERROR] UNC path is not supported as working directory by CMD.EXE.
  echo Copy this folder to a local drive and run again.
  pause
  exit /b 1
)

set "PROJECT=%~dp0OkuSuriShortagePrinter\OkuSuriShortagePrinter.csproj"
if not exist "%PROJECT%" (
  echo [ERROR] Project file not found:
  echo   %PROJECT%
  pause
  exit /b 1
)

set "DOTNET_EXE="
for /f "delims=" %%D in ('where dotnet 2^>nul') do (
  set "DOTNET_EXE=%%D"
  goto :found_dotnet
)
if exist "%ProgramFiles%\dotnet\dotnet.exe" (
  set "DOTNET_EXE=%ProgramFiles%\dotnet\dotnet.exe"
)

:found_dotnet
if not defined DOTNET_EXE (
  echo [ERROR] dotnet.exe not found.
  echo Install .NET SDK 8, then run this file again.
  pause
  exit /b 1
)

rem Close the running app if it exists
tasklist /FI "IMAGENAME eq OkuSuriShortagePrinter.exe" /FO CSV /NH 2>nul | find /I "OkuSuriShortagePrinter.exe" >nul
if %errorlevel%==0 (
  taskkill /IM OkuSuriShortagePrinter.exe /F >nul 2>&1
)

set "WATCH_SCRIPT=%~dp0tools\dev_watch.ps1"
if not exist "%WATCH_SCRIPT%" (
  echo [ERROR] Watch script not found:
  echo   %WATCH_SCRIPT%
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%WATCH_SCRIPT%" -Project "%PROJECT%" -DotnetExe "%DOTNET_EXE%"
if errorlevel 1 (
  echo.
  echo [ERROR] Dev watcher failed with exit code %errorlevel%.
  pause
  exit /b %errorlevel%
)

exit /b 0
