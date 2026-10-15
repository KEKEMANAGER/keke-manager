@echo off
chcp 65001 >nul
cd /d "%~dp0"
cls
set LOG=%TEMP%\keke-deploy-import.txt
echo KEKE Manager - deploy booking-import > "%LOG%"

echo ==================================================
echo   KEKE Manager  -  deploy the PDF reader
echo   (Supabase Edge Function: booking-import)
echo ==================================================
echo.

echo [1/3] Trying to deploy...
call npx --yes supabase@latest functions deploy booking-import --project-ref brrjuxgxmpgvkddcuaad >> "%LOG%" 2>&1
if not errorlevel 1 goto :ok

findstr /C:"Access token not provided" "%LOG%" >nul
if errorlevel 1 goto :fail

echo.
echo   Not logged in to Supabase yet.
echo.
echo ==================================================
echo   A BROWSER WINDOW WILL OPEN NOW.
echo   Press "Authorize" there, then come back here.
echo   This is needed only once - ever.
echo ==================================================
echo.
echo [2/3] Logging in...
call npx --yes supabase@latest login >> "%LOG%" 2>&1
if errorlevel 1 goto :fail

echo [3/3] Deploying again...
call npx --yes supabase@latest functions deploy booking-import --project-ref brrjuxgxmpgvkddcuaad >> "%LOG%" 2>&1
if errorlevel 1 goto :fail

:ok
copy /y "%LOG%" "%~dp0deploy-import-log.txt" >nul
echo.
echo ==================================================
echo  DEPLOYED. Tell Claude "gavida" and he will test it.
echo ==================================================
pause
exit /b 0

:fail
copy /y "%LOG%" "%~dp0deploy-import-log.txt" >nul
echo.
echo ==================================================
echo  FAILED - tell Claude "ver gavida", he reads the log.
echo ==================================================
type "%LOG%"
pause
exit /b 1
