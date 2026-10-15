@echo off
chcp 65001 >nul
cd /d "%~dp0"
cls
set LOG=%TEMP%\keke-site.txt
echo KEKE Manager - deploy website > "%LOG%"

echo ==================================================
echo   KEKE Manager  -  deploy the website
echo   (build + Cloudflare Pages: kekemanager)
echo ==================================================
echo.
echo   This takes a few minutes. Leave the window open.
echo.

echo [1/2] Building the web bundle...
call npm run build >> "%LOG%" 2>&1
if errorlevel 1 goto :fail

echo   Built.
echo.

echo [2/2] Uploading to Cloudflare Pages...
echo   If a browser opens, press Allow - that is the Cloudflare login.
echo.
call npx --yes wrangler@3 pages deploy dist --project-name=kekemanager >> "%LOG%" 2>&1
if errorlevel 1 goto :fail

copy /y "%LOG%" "%~dp0site-log.txt" >nul
echo.
echo ==================================================
echo  LIVE. Open kekemanager.com and hard-refresh
echo  (Ctrl+F5) to see the App Store button.
echo ==================================================
pause
exit /b 0

:fail
copy /y "%LOG%" "%~dp0site-log.txt" >nul
echo.
echo ==================================================
echo  FAILED - tell Claude "ver gaigzavna saiti".
echo ==================================================
echo.
powershell -NoProfile -Command "Get-Content -Tail 40 '%LOG%'"
pause
exit /b 1
