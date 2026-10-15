@echo off
chcp 65001 >nul
cd /d "%~dp0"
cls
echo ==================================================
echo   KEKE Manager  -  Push + Build
echo   (PDF import  +  App Review 3.1.1 fix)
echo ==================================================
echo.

echo [1/4] Committing changed files...
git add supabase/functions/booking-import/index.ts lib/bookingImport.ts "app/(app)/import-booking.tsx" "app/(app)/profile.tsx" "app/(auth)/sign-up.tsx" "app/(driver)/vehicle.tsx" src/locales/ka.json src/locales/en.json src/locales/ru.json src/locales/hy.json
git commit -m "Driver vehicles: hide blank draft rows from the list"
echo.

echo [2/4] Pulling and pushing to GitHub...
git pull --rebase origin master
git push origin master
if errorlevel 1 goto :pushfail
echo   Push OK.
echo.

echo [3/4] Starting iOS build (auto-submit to App Store Connect)...
call npx --yes eas-cli@latest build --platform ios --profile production --non-interactive --auto-submit --no-wait
echo.

echo [4/4] Starting Android build (NO submit - upload the .aab yourself)...
call npx --yes eas-cli@latest build --platform android --profile production --non-interactive --no-wait
echo.

echo ==================================================
echo  Done. Watch progress at:
echo  https://expo.dev/accounts/kekemanager/projects/keke-manager-app/builds
echo ==================================================
pause
exit /b 0

:pushfail
echo.
echo ==================================================
echo  PUSH FAILED - builds NOT started.
echo  Copy the red text above and send it to Claude.
echo ==================================================
pause
exit /b 1
