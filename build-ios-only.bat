@echo off
chcp 65001 >nul
cd /d "%~dp0"
cls
echo ==================================================
echo   KEKE Manager  -  iOS build only (auto-submit)
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

echo [3/3] Starting iOS build (auto-submit to App Store Connect)...
echo   Android is NOT built - no credit is spent on it.
echo.
call npx --yes eas-cli@latest build --platform ios --profile production --non-interactive --auto-submit --no-wait

echo.
echo ==================================================
echo  Started. Watch it here:
echo  https://expo.dev/accounts/kekemanager/projects/keke-manager-app/builds
echo ==================================================
pause
exit /b 0

:dirty
echo.
echo ==================================================
echo  STOP - there are uncommitted changes.
echo.
echo  Building now would build the OLD code. This is
echo  exactly what happened with the last App Review
echo  rejection: the fix was written but never shipped.
echo.
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
