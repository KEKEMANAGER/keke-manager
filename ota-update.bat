@echo off
chcp 65001 >nul
cd /d "%~dp0"
cls
set LOG=%TEMP%\keke-ota.txt
echo KEKE Manager - OTA update > "%LOG%"

echo ==================================================
echo   KEKE Manager  -  OTA update (no store review)
echo   Sends new JS to the phones already installed.
echo ==================================================
echo.

echo [1/2] Checking that everything is committed...
for /f "delims=" %%i in ('git status --porcelain --untracked-files^^=no') do goto :dirty
echo   Clean.
echo.

echo [2/2] Publishing the update to the production channel...
echo   No build credit is spent. Phones pick it up on next launch.
echo.
call npx --yes eas-cli@latest update --channel production --platform all --message "Importer header-row fix + 8 MB upload cap; SUV/4x4 split" --non-interactive >> "%LOG%" 2>&1
if errorlevel 1 goto :fail

type "%LOG%"
copy /y "%LOG%" "%~dp0ota-log.txt" >nul
echo.
echo ==================================================
echo  PUBLISHED. Tell Claude "gavida OTA".
echo ==================================================
pause
exit /b 0

:dirty
echo.
echo ==================================================
echo  STOP - there are uncommitted changes.
echo  Run push-only.bat first, then run this again.
echo ==================================================
git status --short --untracked-files=no
pause
exit /b 1

:fail
type "%LOG%"
copy /y "%LOG%" "%~dp0ota-log.txt" >nul
echo.
echo ==================================================
echo  FAILED - tell Claude "ver gavida OTA", he reads the log.
echo ==================================================
pause
exit /b 1
