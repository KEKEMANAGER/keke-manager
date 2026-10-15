@echo off
chcp 65001 >nul
cd /d "%~dp0"
cls
set LOG=%TEMP%\keke-push2.txt
echo KEKE Manager - stash logs, rebase, push > "%LOG%"

rem Not a real conflict. The rebase refused because two files the scripts
rem themselves write - gaushvi-9-log.txt and finish-log.txt - are tracked by
rem git and had changed. They are run output, so they go on the stash for the
rem length of the rebase and come back afterwards.

echo ==================================================
echo   KEKE Manager  -  push GitHub-ze, meore cda
echo ==================================================
echo.

echo [1/5] Putting the log files aside...
echo === stash === >> "%LOG%"
call git stash push -m keke-logs -- gaushvi-9-log.txt finish-log.txt >> "%LOG%" 2>&1
echo   Done.
echo.

echo [2/5] Fetching...
echo === fetch === >> "%LOG%"
call git fetch origin master >> "%LOG%" 2>&1
if errorlevel 1 goto :fail
echo   Fetched.
echo.

echo [3/5] Rebasing on top of GitHub...
echo === rebase === >> "%LOG%"
call git pull --rebase origin master >> "%LOG%" 2>&1
if errorlevel 1 goto :conflict
echo   Rebased.
echo.

echo [4/5] Pushing...
echo === push === >> "%LOG%"
call git push origin master >> "%LOG%" 2>&1
if errorlevel 1 goto :fail
echo   Pushed.
echo.

echo [5/5] Putting the log files back...
echo === stash pop === >> "%LOG%"
call git stash pop >> "%LOG%" 2>&1
call git log --oneline -4 >> "%LOG%" 2>&1
echo   Done.
echo.

copy /y "%LOG%" "%~dp0push-result.txt" >nul
echo ==================================================
echo  DONE - everything is on GitHub.
echo  Tell Claude "gavida push".
echo ==================================================
pause
exit /b 0

:conflict
copy /y "%LOG%" "%~dp0push-result.txt" >nul
echo.
echo ==================================================
echo  REBASE CONFLICT - nothing was pushed.
echo  Do NOT run anything else. Tell Claude "konfliqti".
echo ==================================================
pause
exit /b 1

:fail
copy /y "%LOG%" "%~dp0push-result.txt" >nul
echo.
echo ==================================================
echo  FAILED - tell Claude "push ver gavida".
echo ==================================================
pause
exit /b 1
