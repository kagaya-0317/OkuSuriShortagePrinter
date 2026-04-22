@echo off
chcp 65001 >nul
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

rem Guard: CMD cannot use UNC path as current directory
echo %CD% | findstr /b "\\\\" >nul
if %errorlevel%==0 (
  echo [ERROR] UNC path is not supported as working directory by CMD.EXE.
  echo Copy this folder to a local drive and run again.
  pause
  exit /b 1
)

call :ensure_dotnet
if errorlevel 1 exit /b 1

call :ensure_webview2
if errorlevel 1 exit /b 1

call :sync_project_icons
if errorlevel 1 exit /b 1

set "SHORTCUT_DIR=%~dp0"

echo [INFO] Publishing app (win-x64) ...
set "DOTNET_EXE="
for /f "delims=" %%D in ('where dotnet 2^>nul') do set "DOTNET_EXE=%%D"
if not defined DOTNET_EXE (
  if exist "%ProgramFiles%\dotnet\dotnet.exe" set "DOTNET_EXE=%ProgramFiles%\dotnet\dotnet.exe"
)

if not defined DOTNET_EXE (
  echo [ERROR] dotnet.exe not found even after install.
  pause
  exit /b 1
)

if exist "%~dp0publish" rmdir /s /q "%~dp0publish"
mkdir "%~dp0publish" >nul 2>nul

"%DOTNET_EXE%" publish "%~dp0OkuSuriShortagePrinter\OkuSuriShortagePrinter.csproj" -c Release -r win-x64 --self-contained false -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -o "%~dp0publish"
if errorlevel 1 (
  echo [ERROR] Publish failed.
  pause
  exit /b 1
)
if exist "%~dp0OkuSuriShortagePrinter\ui\icon.png" (
  if not exist "%~dp0publish\ui" mkdir "%~dp0publish\ui" >nul 2>nul
  copy /y "%~dp0OkuSuriShortagePrinter\ui\icon.png" "%~dp0publish\ui\icon.png" >nul
)
if exist "%~dp0OkuSuriShortagePrinter\app.ico" (
  copy /y "%~dp0OkuSuriShortagePrinter\app.ico" "%~dp0publish\app.ico" >nul
)
call :make_shortcut "%~dp0publish\OkuSuriShortagePrinter.exe" "%SHORTCUT_DIR%" "%~dp0publish\app.ico"
if errorlevel 1 exit /b 1
echo [OK] Done.
echo Shortcut created in: %SHORTCUT_DIR%
pause
exit /b 0

:ensure_dotnet
where dotnet >nul 2>nul && exit /b 0
if exist "%ProgramFiles%\dotnet\dotnet.exe" exit /b 0

where winget >nul 2>nul
if %errorlevel%==0 (
  echo [INFO] Installing .NET SDK 8 via winget...
  winget install -e --id Microsoft.DotNet.SDK.8 --accept-package-agreements --accept-source-agreements --silent
  exit /b 0
)

if exist "%~dp0tools\dotnet-sdk-8-win-x64.exe" (
  echo [INFO] Installing .NET SDK 8 from tools\dotnet-sdk-8-win-x64.exe ...
  "%~dp0tools\dotnet-sdk-8-win-x64.exe" /install /quiet /norestart
  exit /b 0
)

echo [ERROR] .NET SDK 8 is required but not found.
echo Install it manually OR place the installer at:
echo   %~dp0tools\dotnet-sdk-8-win-x64.exe
pause
exit /b 1

:sync_project_icons
set "SRC_ICON_PNG=%~dp0icon\icon.png"
set "DST_UI_ICON_PNG=%~dp0OkuSuriShortagePrinter\ui\icon.png"
set "DST_APP_ICON_ICO=%~dp0OkuSuriShortagePrinter\app.ico"

if not exist "%SRC_ICON_PNG%" (
  for %%F in ("%~dp0icon\*.png") do (
    set "SRC_ICON_PNG=%%~fF"
    goto :icon_source_found
  )
  echo [WARN] icon\icon.png not found and no PNG exists in icon folder. Skip icon sync.
  exit /b 0
)
:icon_source_found
if /i not "%SRC_ICON_PNG%"=="%~dp0icon\icon.png" (
  echo [WARN] icon\icon.png not found. Use "%SRC_ICON_PNG%" as icon source.
)

echo [INFO] Syncing icons from icon\icon.png ...
copy /y "%SRC_ICON_PNG%" "%DST_UI_ICON_PNG%" >nul
if errorlevel 1 (
  echo [ERROR] Failed to copy icon\icon.png to ui\icon.png.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\convert_png_to_ico.ps1" -Source "%SRC_ICON_PNG%" -Destination "%DST_APP_ICON_ICO%"
if errorlevel 1 (
  echo [ERROR] Failed to generate app.ico from icon\icon.png.
  pause
  exit /b 1
)
exit /b 0
:ensure_webview2
call :has_webview2
if %errorlevel%==0 exit /b 0

where winget >nul 2>nul
if %errorlevel%==0 (
  echo [INFO] Installing WebView2 Runtime via winget...
  winget install -e --id Microsoft.EdgeWebView2Runtime --accept-package-agreements --accept-source-agreements --silent
  exit /b 0
)

if exist "%~dp0tools\MicrosoftEdgeWebView2Setup.exe" (
  echo [INFO] Installing WebView2 Runtime from tools\MicrosoftEdgeWebView2Setup.exe ...
  "%~dp0tools\MicrosoftEdgeWebView2Setup.exe" /silent /install
  exit /b 0
)

echo [ERROR] WebView2 Runtime is required but not found.
echo Install it manually OR place the installer at:
echo   %~dp0tools\MicrosoftEdgeWebView2Setup.exe
pause
exit /b 1

:has_webview2
reg query "HKLM\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" /v pv >nul 2>nul && exit /b 0
if exist "%ProgramFiles(x86)%\Microsoft\EdgeWebView\Application\msedgewebview2.exe" exit /b 0
for /d %%D in ("%ProgramFiles(x86)%\Microsoft\EdgeWebView\Application\*") do if exist "%%D\msedgewebview2.exe" exit /b 0
exit /b 1

:make_shortcut
set "TARGET=%~1"
set "LINKDIR=%~2"
set "ICON=%~3"
if "%LINKDIR:~-1%"=="\" set "LINKDIR=%LINKDIR:~0,-1%"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\make_shortcut.ps1" -TargetPath "%TARGET%" -LinkDirectory "%LINKDIR%" -UseDefaultJapaneseName -IconPath "%ICON%"
if errorlevel 1 (
  echo [ERROR] Failed to create shortcut.
  pause
  exit /b 1
)
exit /b 0

