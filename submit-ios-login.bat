@echo off
chcp 65001 >nul
cd /d "%~dp0"
cls
echo ==================================================
echo   KEKE Manager  -  iOS App Store submit
echo ==================================================
echo.
echo  Apple ID-s da parols mtxovs qvemot.
echo  Apple ID: akachibaia1410@gmail.com
echo.
echo  Tu 2FA kods itxovs - telefonze mova.
echo ==================================================
echo.
call npx --yes eas-cli@latest submit --platform ios --latest
echo.
echo ==================================================
echo  EXITCODE=%ERRORLEVEL%   (0 = warmatebit gaigzavna)
echo ==================================================
pause
