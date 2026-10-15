@echo off
chcp 65001 >nul
cd /d "%~dp0"
cls
echo ===========================================
echo   KEKE Manager  -  iOS App Store submit
echo ===========================================
echo.
echo Working... this takes a few minutes.
echo Output is written to eas-submit-ios.log
echo.
call npx --yes eas-cli@latest submit --platform ios --latest --non-interactive > eas-submit-ios.log 2>&1
echo EXITCODE=%ERRORLEVEL% >> eas-submit-ios.log
type eas-submit-ios.log
echo.
echo ===========================================
echo   Finished. You can close this window.
echo ===========================================
pause
