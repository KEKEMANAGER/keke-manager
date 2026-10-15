@echo off
chcp 65001 >nul
cd /d "%~dp0"
cls
set LOG=%TEMP%\keke-gaushvi-9.txt
echo KEKE Manager - smart dispatch (risk warnings, empty-leg, importer memory) > "%LOG%"
echo. >> "%LOG%"

echo ==================================================
echo   KEKE Manager  -  3 akhali chkvinai punqcia
echo.
echo   1. No-show gafrtkhileba javshnis bartze
echo   2. Empty-leg - akhlos mkhoeli pirveli
echo   3. Importeri ikhsenebs kompaniis shabloni
echo ==================================================
echo.

rem ---------------------------------------------------------------- [1/6]
echo [1/6] Checking that the new files arrived...
set MISSING=0
for %%F in (
  "lib\bookingRisk.ts"
  "lib\emptyLegChaining.ts"
  "components\BookingRiskBadge.tsx"
  "supabase\migrations\20261012090000_drivers_finishing_near.sql"
  "supabase\migrations\20261012093000_company_import_labels.sql"
) do (
  if not exist %%F (
    echo   MISSING: %%F
    echo MISSING: %%F >> "%LOG%"
    set MISSING=1
  )
)
if %MISSING%==1 goto :fail
echo   All five new files are here.
echo.

rem ---------------------------------------------------------------- [2/6]
rem Typecheck BEFORE anything is committed or published. If a file arrived
rem truncated or mangled this is where it shows, and nothing has shipped yet.
echo [2/6] Typechecking the whole project (takes a few minutes)...
echo === tsc === >> "%LOG%"
call npx tsc --noEmit >> "%LOG%" 2>&1
if errorlevel 1 (
  echo.
  echo   TYPECHECK FAILED - nothing has been committed or published.
  echo   Tell Claude "tsc chavarda" and he reads the log.
  goto :fail
)
echo   Clean.
echo.

rem ---------------------------------------------------------------- [3/6]
echo [3/6] Committing locally...
echo === git === >> "%LOG%"
echo --- working tree before commit --- >> "%LOG%"
call git status --short >> "%LOG%" 2>&1
call git add -A >> "%LOG%" 2>&1
call git diff --cached --quiet
if not errorlevel 1 (
  echo   Nothing to commit - already committed.
) else (
  call git commit -F "keke-commit-msg.txt" >> "%LOG%" 2>&1
  if errorlevel 1 goto :fail
  echo   Committed.
)
call git log --oneline -1 >> "%LOG%" 2>&1
echo.

rem ---------------------------------------------------------------- [4/6]
rem The OTA goes FIRST of the two deploys, because it carries features 1 and 2
rem and must not be held up by a Supabase browser login.
echo [4/6] Publishing the OTA update (no build credit, no store review)...
echo === eas update === >> "%LOG%"
call npx --yes eas-cli@latest update --channel production --platform all --message "No-show risk warnings on booking cards; empty-leg driver chaining in dispatch" --non-interactive >> "%LOG%" 2>&1
if errorlevel 1 (
  echo.
  echo   OTA FAILED. Tell Claude "ver gavida OTA" - he reads the log.
  echo   (If the internet dropped, just run this file again.)
  goto :fail
)
echo   Published. Phones pick it up on next launch.
echo.

rem ---------------------------------------------------------------- [5/6]
rem Feature 3 lives in the edge function. A failure here does NOT undo the OTA,
rem so it is reported and the script still finishes successfully.
echo [5/6] Deploying the importer (Supabase booking-import)...
echo === supabase functions deploy === >> "%LOG%"
set IMPORTER=ok
call npx --yes supabase@latest functions deploy booking-import --project-ref brrjuxgxmpgvkddcuaad >> "%LOG%" 2>&1
if not errorlevel 1 goto :importer_done

findstr /C:"Access token not provided" "%LOG%" >nul
if errorlevel 1 (
  set IMPORTER=failed
  goto :importer_done
)

echo.
echo   ==================================================
echo   A BROWSER WINDOW WILL OPEN NOW.
echo   Press "Authorize" there, then come back here.
echo   Only needed once - ever.
echo   ==================================================
echo.
call npx --yes supabase@latest login >> "%LOG%" 2>&1
if errorlevel 1 (
  set IMPORTER=failed
  goto :importer_done
)
call npx --yes supabase@latest functions deploy booking-import --project-ref brrjuxgxmpgvkddcuaad >> "%LOG%" 2>&1
if errorlevel 1 set IMPORTER=failed

:importer_done
if "%IMPORTER%"=="ok" (
  echo   Importer deployed.
) else (
  echo   Importer NOT deployed - the OTA above is live anyway.
  echo   Tell Claude "importeri ver gavida".
)
echo.

rem ---------------------------------------------------------------- [6/6]
rem Non-fatal: the work is already live, this only gets it onto GitHub.
echo [6/6] Pushing to GitHub...
echo === git push === >> "%LOG%"
set PUSHED=ok
call git push origin master >> "%LOG%" 2>&1
if errorlevel 1 set PUSHED=failed
if "%PUSHED%"=="ok" (echo   Pushed.) else (echo   Push failed - run push-only.bat later.)
echo.

copy /y "%LOG%" "%~dp0gaushvi-9-log.txt" >nul
echo ==================================================
echo  DONE.
echo    OTA ............ published
echo    importer ....... %IMPORTER%
echo    github push .... %PUSHED%
echo.
echo  Tell Claude "gavida 9".
echo ==================================================
pause
exit /b 0

:fail
copy /y "%LOG%" "%~dp0gaushvi-9-log.txt" >nul
echo.
echo ==================================================
echo  STOPPED. Tell Claude "ver gavida 9" - he reads the log.
echo ==================================================
pause
exit /b 1
