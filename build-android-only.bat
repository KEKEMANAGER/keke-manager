@echo off
chcp 65001 >nul
cd /d "%~dp0"
cls
echo ==================================================
echo   KEKE Manager  -  Android build only (Google Play)
echo ==================================================
echo.

echo [1/3] Checking that everything is committed...
for /f "delims=" %%i in ('git status --porcelain --untracked-files^=no') do goto :dirty
echo   Clean.
echo.

echo [2/3] Checking that everything is pushed...
git fetch origin master >nul 2>&1
for /f "delims=" %%i in ('git rev-list origin/master..HEAD') do goto :unpushed
echo   Pushed.
echo.
git log --oneline -1
echo.

echo [3/3] Starting Android build (.aab for Google Play)...
echo   iOS is NOT built - no credit is spent on it.
echo.
call npx --yes eas-cli@latest build --platform android --profile production --non-interactive --no-wait

echo.
echo ==================================================
echo  Started. When it is ready, download the .aab here:
echo  https://expo.dev/accounts/kekemanager/projects/keke-manager-app/builds
echo  Then upload it in Google Play Console - Production.
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

:unpushed
echo.
echo ==================================================
echo  STOP - there are commits that are not on GitHub.
echo  Run push-only.bat first, then run this again.
echo ==================================================
git log --oneline origin/master..HEAD
pause
exit /b 1
