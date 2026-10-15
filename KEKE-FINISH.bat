@echo off
chcp 65001 >nul
cd /d "%~dp0"
cls
set LOG=%TEMP%\keke-finish.txt
echo KEKE Manager - finish: importer deploy + push > "%LOG%"

rem GAUSHVI-9 stopped after the OTA because of a parenthesis inside an echo
rem on line 79: cmd.exe read that ")" as the end of the IF block, so "goto
rem :fail" ran even though the OTA had succeeded. Commit and OTA are done;
rem this picks up the two steps that were skipped. No parentheses in any echo
rem here, deliberately.

echo ==================================================
echo   KEKE Manager  -  darchenili 2 nabiji
echo.
echo   commit da OTA ukve gakettebulia
echo   1. importeris deploy
echo   2. push GitHub-ze
echo ==================================================
echo.

echo [1/2] Deploying the importer...
echo === supabase functions deploy === >> "%LOG%"
set IMPORTER=ok
call npx --yes supabase@latest functions deploy booking-import --project-ref brrjuxgxmpgvkddcuaad >> "%LOG%" 2>&1
if not errorlevel 1 goto :importer_done

findstr /C:"Access token not provided" "%LOG%" >nul
if errorlevel 1 goto :importer_failed

echo.
echo   ==================================================
echo   A BROWSER WINDOW WILL OPEN NOW.
echo   Press "Authorize" there, then come back here.
echo   Only needed once - ever.
echo   ==================================================
echo.
call npx --yes supabase@latest login >> "%LOG%" 2>&1
if errorlevel 1 goto :importer_failed
call npx --yes supabase@latest functions deploy booking-import --project-ref brrjuxgxmpgvkddcuaad >> "%LOG%" 2>&1
if errorlevel 1 goto :importer_failed
goto :importer_done

:importer_failed
set IMPORTER=failed

:importer_done
if "%IMPORTER%"=="ok" echo   Importer deployed.
if not "%IMPORTER%"=="ok" echo   Importer NOT deployed - tell Claude "importeri ver gavida".
echo.

echo [2/2] Pushing to GitHub...
echo === git push === >> "%LOG%"
set PUSHED=ok
call git push origin master >> "%LOG%" 2>&1
if errorlevel 1 set PUSHED=failed
if "%PUSHED%"=="ok" echo   Pushed.
if not "%PUSHED%"=="ok" echo   Push failed - tell Claude "push ver gavida".
echo.

copy /y "%LOG%" "%~dp0finish-log.txt" >nul
echo ==================================================
echo  DONE.
echo    importer ....... %IMPORTER%
echo    github push .... %PUSHED%
echo.
echo  Tell Claude "gavida finish".
echo ==================================================
pause
exit /b 0
