@echo off
chcp 65001 >nul
cd /d "%~dp0"
cls
set LOG=%TEMP%\keke-floti.txt
echo KEKE Manager - fleet on the driver profile > "%LOG%"
echo. >> "%LOG%"

rem No parentheses inside any echo in this file, and no parenthesised IF
rem blocks at all - only goto labels. GAUSHVI-9 stopped after a successful OTA
rem because a ")" inside an echo closed its IF block early.

echo ==================================================
echo   KEKE Manager  -  mdzgholis avtoebi profilze
echo.
echo   profilze agar aris erti tipi da erti klasi
echo   profilze aris mdzgholis qvela manqanis sia
echo ==================================================
echo.

rem ---------------------------------------------------------------- [1/4]
echo [1/4] Checking that the new file arrived...
if not exist "components\driver\DriverVehiclesSummary.tsx" goto :nofile
echo   Here.
echo.
goto :typecheck

:nofile
echo   MISSING: components\driver\DriverVehiclesSummary.tsx
echo MISSING: components\driver\DriverVehiclesSummary.tsx >> "%LOG%"
goto :fail

rem ---------------------------------------------------------------- [2/4]
:typecheck
echo [2/4] Typechecking the whole project - takes a few minutes...
echo === tsc === >> "%LOG%"
call npx tsc --noEmit >> "%LOG%" 2>&1
if errorlevel 1 goto :tscfail
echo   Clean.
echo.
goto :commit

:tscfail
echo.
echo   TYPECHECK FAILED - nothing has been committed or published.
echo   Tell Claude "tsc chavarda" and he reads the log.
goto :fail

rem ---------------------------------------------------------------- [3/4]
:commit
echo [3/4] Committing locally...
echo === git === >> "%LOG%"
echo --- working tree before commit --- >> "%LOG%"
call git status --short >> "%LOG%" 2>&1
call git add -A >> "%LOG%" 2>&1
call git diff --cached --quiet
if not errorlevel 1 goto :nothing_to_commit
call git commit -F "keke-commit-msg.txt" >> "%LOG%" 2>&1
if errorlevel 1 goto :fail
echo   Committed.
goto :committed

:nothing_to_commit
echo   Nothing to commit - already committed.

:committed
call git log --oneline -1 >> "%LOG%" 2>&1
echo.

rem ---------------------------------------------------------------- [4/4]
echo [4/4] Publishing the OTA update - no build credit, no store review...
echo === eas update === >> "%LOG%"
call npx --yes eas-cli@latest update --channel production --platform all --message "Driver profile shows the whole fleet instead of one vehicle type" --non-interactive >> "%LOG%" 2>&1
if errorlevel 1 goto :otafail
echo   Published. Phones pick it up on next launch.
echo.
goto :push

:otafail
echo.
echo   OTA FAILED. Tell Claude "ver gavida OTA" - he reads the log.
echo   If the internet dropped, just run this file again.
goto :fail

rem ---- push is extra: the work is already live once the OTA is published ----
:push
echo Pushing to GitHub...
echo === git push === >> "%LOG%"
set PUSHED=ok
call git push origin master >> "%LOG%" 2>&1
if errorlevel 1 set PUSHED=failed
if "%PUSHED%"=="ok" echo   Pushed.
if not "%PUSHED%"=="ok" echo   Push failed - run KEKE-PUSH2.bat later.
echo.

copy /y "%LOG%" "%~dp0floti-log.txt" >nul
echo ==================================================
echo  DONE.
echo    OTA ............ published
echo    github push .... %PUSHED%
echo.
echo  Tell Claude "gavida floti".
echo ==================================================
pause
exit /b 0

:fail
copy /y "%LOG%" "%~dp0floti-log.txt" >nul
echo.
echo ==================================================
echo  STOPPED. Tell Claude "ver gavida floti" - he reads the log.
echo ==================================================
pause
exit /b 1
