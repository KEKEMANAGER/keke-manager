@echo off
chcp 65001 >nul
cd /d "%~dp0"
cls
set LOG=%TEMP%\keke-push.txt
echo KEKE Manager - push > "%LOG%"

echo ==================================================
echo   KEKE Manager  -  Push to GitHub (no app build)
echo ==================================================
echo.

echo [1/4] Staging...
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
git add "lib/georgiaRegions.ts" >> "%LOG%" 2>&1
git add "components/ServiceRegionsSelect.tsx" >> "%LOG%" 2>&1
git add "supabase/migrations/20261009090000_driver_service_regions.sql" >> "%LOG%" 2>&1
git add "lib/driverRatingSort.ts" >> "%LOG%" 2>&1
git add "lib/notifications.ts" >> "%LOG%" 2>&1
git add "lib/groupBooking.ts" >> "%LOG%" 2>&1
git add "app/(driver)/profile.tsx" >> "%LOG%" 2>&1
git add "lib/pickupSignSheetHtml.ts" >> "%LOG%" 2>&1
git add "lib/voucher.ts" >> "%LOG%" 2>&1
git add "lib/voucher.web.ts" >> "%LOG%" 2>&1
git add "components/MeetGreetVoucherSection.tsx" >> "%LOG%" 2>&1
git add "components/CompanyBookingVoucher.tsx" >> "%LOG%" 2>&1
git add "components/TouristBookingVoucher.tsx" >> "%LOG%" 2>&1
git add "lib/companyVerificationGate.ts" >> "%LOG%" 2>&1
git add "components/company/CompanyVerificationGate.tsx" >> "%LOG%" 2>&1
git add "components/company/CompanyVerificationGuard.tsx" >> "%LOG%" 2>&1
git add "lib/adminRegions.ts" >> "%LOG%" 2>&1
git add "lib/adminDispatchLog.ts" >> "%LOG%" 2>&1
git add "lib/adminImportLog.ts" >> "%LOG%" 2>&1
git add "components/admin/AdminRegionsSection.tsx" >> "%LOG%" 2>&1
git add "components/admin/AdminDispatchLogSection.tsx" >> "%LOG%" 2>&1
git add "components/admin/AdminImportLogSection.tsx" >> "%LOG%" 2>&1
git add "components/admin/AdminVerifyPanel.tsx" >> "%LOG%" 2>&1
git add "components/admin/AdminTabBar.tsx" >> "%LOG%" 2>&1
git add "lib/adminVerification.ts" >> "%LOG%" 2>&1
git add "app/(app)/admin-panel.tsx" >> "%LOG%" 2>&1
git add "supabase/migrations/20261009100000_company_approval_gate.sql" >> "%LOG%" 2>&1
git add "supabase/migrations/20261010061500_dispatch_and_import_logs.sql" >> "%LOG%" 2>&1
git add "supabase/migrations/20261010070000_drop_tmp_purge_helper.sql" >> "%LOG%" 2>&1
git status --short >> "%LOG%" 2>&1

echo [2/4] Committing...
git commit -m "Regional dispatch; the driver can print the pickup sign" >> "%LOG%" 2>&1

echo [3/4] Pulling...
git -c rebase.autoStash=true pull --rebase origin master >> "%LOG%" 2>&1
if errorlevel 1 goto :fail

echo [4/4] Pushing...
git push origin master >> "%LOG%" 2>&1
if errorlevel 1 goto :fail

git log --oneline -3 >> "%LOG%" 2>&1
copy /y "%LOG%" "%~dp0push-log.txt" >nul
echo.
echo ==================================================
echo  DONE - pushed. No Expo build credits used.
echo ==================================================
pause
exit /b 0

:fail
git status --short >> "%LOG%" 2>&1
git log --oneline -3 >> "%LOG%" 2>&1
copy /y "%LOG%" "%~dp0push-log.txt" >nul
echo.
echo ==================================================
echo  FAILED - tell Claude "ver gaigzavna", he reads the log.
echo ==================================================
pause
exit /b 1
