@echo off
chcp 65001 >nul
cd /d "%~dp0"
cls
echo ==================================================
echo   KEKE Manager  -  Cloudflare login (once)
echo ==================================================
echo.
echo   A BROWSER WILL OPEN NOW.
echo   Press "Allow" there straight away - it waits
echo   only about a minute.
echo.
call npx --yes wrangler@3 login
echo.
echo ==================================================
echo  Done. Tell Claude.
echo ==================================================
pause
