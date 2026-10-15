@echo off
chcp 65001 >nul
cd /d "%~dp0"
cls
echo ===========================================
echo   KEKE Manager  -  GitHub upload
echo ===========================================
echo.

echo [1/4] adding files...
git add app lib src supabase docs components app.json
if errorlevel 1 goto failed

echo [2/4] commit...
git commit -m "Booking reliability: confirmation, double-booking guard, ratings, tour days"

echo [3/4] pull...
git pull --rebase origin master
if errorlevel 1 goto failed

echo [4/4] push...
git push origin master
if errorlevel 1 goto failed

echo.
echo ===========================================
echo   OK - DONE. Claude takes it from here.
echo ===========================================
echo.
pause
exit /b 0

:failed
echo.
echo ===========================================
echo   PROBLEM - send this window to Claude
echo ===========================================
echo.
pause
exit /b 1
