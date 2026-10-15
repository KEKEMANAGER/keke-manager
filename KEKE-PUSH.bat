@echo off
chcp 65001 >nul
cd /d "%~dp0"
cls
set LOG=%TEMP%\keke-push.txt
echo KEKE Manager - rebase on origin and push > "%LOG%"

rem GitHub had 4 commits this laptop did not: two blog posts and their cover
rem images, pushed from elsewhere. They touch no file this commit touches, so
rem the rebase should be clean. If it is not, the script stops and leaves the
rem rebase in progress rather than guessing.

echo ==================================================
echo   KEKE Manager  -  push GitHub-ze
echo ==================================================
echo.

echo [1/4] Checking the working tree...
echo === status === >> "%LOG%"
call git status --short >> "%LOG%" 2>&1
for /f "delims=" %%i in ('git status --porcelain --untracked-files^^=no') do goto :dirty
echo   Clean.
echo.

echo [2/4] Fetching from GitHub...
echo === fetch === >> "%LOG%"
call git fetch origin master >> "%LOG%" 2>&1
if errorlevel 1 goto :fail
echo   Fetched.
echo.

echo [3/4] Rebasing your commit on top of GitHub...
echo === rebase === >> "%LOG%"
call git pull --rebase origin master >> "%LOG%" 2>&1
if errorlevel 1 goto :conflict
echo   Rebased.
echo.

echo [4/4] Pushing...
echo === push === >> "%LOG%"
call git push origin master >> "%LOG%" 2>&1
if errorlevel 1 goto :fail
call git log --oneline -3 >> "%LOG%" 2>&1
echo   Pushed.
echo.

copy /y "%LOG%" "%~dp0push-result.txt" >nul
echo ==================================================
echo  DONE - everything is on GitHub.
echo  Tell Claude "gavida push".
echo ==================================================
pause
exit /b 0

:dirty
copy /y "%LOG%" "%~dp0push-result.txt" >nul
echo.
echo ==================================================
echo  STOP - there are uncommitted changes.
echo  Tell Claude "chirti xe" and he will look.
echo ==================================================
call git status --short
pause
exit /b 1

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
