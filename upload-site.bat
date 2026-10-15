@echo off
chcp 65001 >nul
cd /d "%~dp0"
cls
echo ==================================================
echo   KEKE Manager  -  upload the website
echo ==================================================
echo.
echo   A BROWSER WILL OPEN NOW for Cloudflare.
echo   Press "Allow" there, then come back here.
echo.
call npx --yes wrangler@3 login
echo.
echo ==================================================
echo   Uploading to Cloudflare Pages...
echo ==================================================
echo.
call npx --yes wrangler@3 pages deploy dist --project-name=kekemanager
echo.
echo ==================================================
echo  A .pages.dev URL above means it is LIVE.
echo  Open kekemanager.com and press Ctrl+F5.
echo ==================================================
pause
