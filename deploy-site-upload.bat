@echo off
chcp 65001 >nul
cd /d "%~dp0"
cls
echo ==================================================
echo   KEKE Manager  -  upload the website
echo   (dist is already built - this only uploads)
echo ==================================================
echo.
echo   STEP 1: a browser will open for Cloudflare.
echo           Press "Allow" there, then come back here.
echo.
pause

call npx --yes wrangler@3 login
echo.
echo ==================================================
echo   STEP 2: uploading to Cloudflare Pages...
echo ==================================================
echo.
call npx --yes wrangler@3 pages deploy dist --project-name=kekemanager
echo.
echo ==================================================
echo  If the lines above end with a .pages.dev URL,
echo  it is LIVE. Open kekemanager.com, press Ctrl+F5.
echo  Then tell Claude what you see here.
echo ==================================================
pause
