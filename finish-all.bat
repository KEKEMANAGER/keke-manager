@echo off
chcp 65001 >nul
cd /d "%~dp0"
cls
set LOG=%TEMP%\keke-finish.txt
echo KEKE Manager - finish everything > "%LOG%"

echo ==================================================
echo   KEKE Manager  -  finishing everything
echo   Leave this window open until it says DONE.
echo ==================================================
echo.
echo  [1/5] Supabase login - A BROWSER OPENS NOW.
echo        Press "Authorize" straight away.
echo.
call npx --yes supabase@latest login
if errorlevel 1 goto :fail

echo.
echo  [2/5] Deploying the PDF reader to Supabase...
call npx --yes supabase@latest functions deploy booking-import --project-ref brrjuxgxmpgvkddcuaad >> "%LOG%" 2>&1
if errorlevel 1 goto :fail
echo        done.
echo.

echo  [3/5] Pushing the code to GitHub...
git add "app.json" >> "%LOG%" 2>&1
git add "app/(app)/_layout.tsx" >> "%LOG%" 2>&1
git add "app/(driver)/_layout.tsx" >> "%LOG%" 2>&1
git add "lib/webPush.ts" >> "%LOG%" 2>&1
git add "public/sw.js" >> "%LOG%" 2>&1
git add "public/_redirects" >> "%LOG%" 2>&1
git add "public/_headers" >> "%LOG%" 2>&1
git add "public/_routes.json" >> "%LOG%" 2>&1
git add "supabase/functions/web-push/index.ts" >> "%LOG%" 2>&1
git add "supabase/functions/web-push/webpush.ts" >> "%LOG%" 2>&1
git add "supabase/migrations/20261002130000_web_push.sql" >> "%LOG%" 2>&1
git add "app/(driver)/gps.tsx" >> "%LOG%" 2>&1
git add "components/BackgroundLocationDisclosureModal.tsx" >> "%LOG%" 2>&1
git add "components/DriverConfirmationBadge.tsx" >> "%LOG%" 2>&1
git add "components/PushNotificationRoot.native.tsx" >> "%LOG%" 2>&1
git add "app/(app)/dashboard.tsx" >> "%LOG%" 2>&1
git add "components/BookingPriceDisplay.tsx" >> "%LOG%" 2>&1
git add "app/(driver)/dashboard.tsx" >> "%LOG%" 2>&1
git add "app/(app)/history.tsx" >> "%LOG%" 2>&1
git add "app/(app)/import-booking.tsx" >> "%LOG%" 2>&1
git add "app/(driver)/bookings.tsx" >> "%LOG%" 2>&1
git add "lib/bookingImport.ts" >> "%LOG%" 2>&1
git add "lib/bookingReminders.ts" >> "%LOG%" 2>&1
git add "lib/bookings.ts" >> "%LOG%" 2>&1
git add "lib/dispatchPushWaves.ts" >> "%LOG%" 2>&1
git add "lib/osrmRouting.ts" >> "%LOG%" 2>&1
git add "lib/pricingModel.ts" >> "%LOG%" 2>&1
git add "lib/routeDistance.ts" >> "%LOG%" 2>&1
git add "lib/vehicleCatalog.ts" >> "%LOG%" 2>&1
git add "lib/vehicleData.ts" >> "%LOG%" 2>&1
git add "src/locales/ka.json" >> "%LOG%" 2>&1
git add "src/locales/en.json" >> "%LOG%" 2>&1
git add "src/locales/ru.json" >> "%LOG%" 2>&1
git add "src/locales/hy.json" >> "%LOG%" 2>&1
git add "supabase/functions/booking-import/index.ts" >> "%LOG%" 2>&1
git add "supabase/migrations/20260930120000_server_side_new_booking_push.sql" >> "%LOG%" 2>&1
git add "supabase/migrations/20260930121000_auto_activate_first_approved_vehicle.sql" >> "%LOG%" 2>&1
git add "supabase/migrations/20260930122000_lock_down_push_internals.sql" >> "%LOG%" 2>&1
git add "supabase/migrations/20260930140000_route_distance_cache.sql" >> "%LOG%" 2>&1
git add "supabase/migrations/20260930141000_bookings_hotel_column.sql" >> "%LOG%" 2>&1
git add "supabase/migrations/20260930200000_nag_open_tour_days.sql" >> "%LOG%" 2>&1
git add "supabase/migrations/20260930210000_price_requests.sql" >> "%LOG%" 2>&1
git add "supabase/functions/price-quote/index.ts" >> "%LOG%" 2>&1
git add "supabase/migrations/20261001090000_app_settings.sql" >> "%LOG%" 2>&1
git add "app/(app)/price-request.tsx" >> "%LOG%" 2>&1
git add "app/(app)/new-booking.tsx" >> "%LOG%" 2>&1
git add "lib/priceRequests.ts" >> "%LOG%" 2>&1
git add "lib/tripProgress.ts" >> "%LOG%" 2>&1
git add "lib/backgroundLocation.native.ts" >> "%LOG%" 2>&1
git add "lib/backgroundLocation.web.ts" >> "%LOG%" 2>&1
git add "components/landing/LandingFooter.tsx" >> "%LOG%" 2>&1
git add "components/landing/LandingIllustrations.tsx" >> "%LOG%" 2>&1
git add "components/admin/AdminVerifySection.tsx" >> "%LOG%" 2>&1
git add "components/admin/AdminVehicleVerifySection.tsx" >> "%LOG%" 2>&1
git add "components/admin/AdminVehiclePhotoAuditSection.tsx" >> "%LOG%" 2>&1
git add "hooks/useKeyboardVisible.ts" >> "%LOG%" 2>&1
git add "app/(app)/chat.tsx" >> "%LOG%" 2>&1
git add "app/(driver)/chat.tsx" >> "%LOG%" 2>&1
git add "components/ConvoyChatContent.tsx" >> "%LOG%" 2>&1
git add "components/DateTimeField.tsx" >> "%LOG%" 2>&1
git add "components/DateOnlyField.tsx" >> "%LOG%" 2>&1
git status --short >> "%LOG%" 2>&1
git commit -m "Chat bar clears the keyboard; the time picker waits for Done" >> "%LOG%" 2>&1
git -c rebase.autoStash=true pull --rebase origin master >> "%LOG%" 2>&1
if errorlevel 1 goto :fail
git push origin master >> "%LOG%" 2>&1
if errorlevel 1 goto :fail
echo        done.
echo.

echo  [4/5] Building the website - this takes a few minutes...
call npm run build >> "%LOG%" 2>&1
if errorlevel 1 goto :fail
echo        built. Uploading to Cloudflare...
call npx --yes wrangler@3 login
call npx --yes wrangler@3 pages deploy dist --project-name=kekemanager >> "%LOG%" 2>&1
if errorlevel 1 goto :fail
echo        done.
echo.

echo  [5/5] Sending the update to the phones...
call npx --yes eas-cli@latest update --channel production --platform all --message "Keyboard, time picker, importer fix, 8 MB, SUV/4x4" --non-interactive >> "%LOG%" 2>&1
if errorlevel 1 goto :fail
echo        done.

copy /y "%LOG%" "%~dp0finish-log.txt" >nul
echo.
echo ==================================================
echo  DONE - everything is live. Tell Claude "gavida".
echo ==================================================
pause
exit /b 0

:fail
copy /y "%LOG%" "%~dp0finish-log.txt" >nul
echo.
echo ==================================================
echo  STOPPED - tell Claude "shedga sheclioma",
echo  he reads finish-log.txt.
echo ==================================================
echo.
powershell -NoProfile -Command "Get-Content -Tail 30 '%LOG%'"
pause
exit /b 1
