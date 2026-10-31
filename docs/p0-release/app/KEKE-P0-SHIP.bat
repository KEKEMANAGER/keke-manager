@echo off
setlocal
rem KEKE Manager - P0 app update. Run ONLY after the founder approved this step
rem and the six database steps (P0-1 .. P0-6) passed their checks.
rem   1. master on GitHub moves forward to the release branch (fast-forward only);
rem      Cloudflare then builds kekemanager.com from master by itself.
rem   2. the phones get the same code as an over-the-air update (production
rem      channel, runtime 1.0.0 - every installed build uses it).
cd /d "%~dp0"
set "LOG=%~dp0p0-ship-log.txt"
set "BR=release/p0-1-to-p0-5"
echo KEKE Manager - P0 app update > "%LOG%"
echo === STEP fetch === >> "%LOG%"
git fetch origin master "%BR%" >> "%LOG%" 2>&1
if errorlevel 1 goto :fail
echo === STEP master must be an ancestor of the release === >> "%LOG%"
git merge-base --is-ancestor origin/master "origin/%BR%" >> "%LOG%" 2>&1
if errorlevel 1 goto :fail
echo === STEP push master forward (fast-forward only) === >> "%LOG%"
git push origin "refs/remotes/origin/%BR%:refs/heads/master" >> "%LOG%" 2>&1
if errorlevel 1 goto :fail
echo === STEP local master forward === >> "%LOG%"
git checkout -- lib/generated public/blogManifest.json public/sitemap.xml public/blog public/llms-full.txt >> "%LOG%" 2>&1
git checkout master >> "%LOG%" 2>&1
git merge --ff-only "origin/%BR%" >> "%LOG%" 2>&1
if errorlevel 1 goto :fail
git log -1 --format="%%h %%s" >> "%LOG%" 2>&1
echo === STEP ota === >> "%LOG%"
call npx --yes eas-cli@latest update --channel production --platform all --message "P0-1..P0-5: decline per driver, one reassign, approved drivers only, server push, company cancellation" --non-interactive >> "%LOG%" 2>&1
if errorlevel 1 goto :otafail
echo === STEP ota OK === >> "%LOG%"
echo === ALL DONE (kekemanager.com: Cloudflare builds master by itself) === >> "%LOG%"
exit /b 0
:otafail
echo === FAILED ota (master and the website are updated; the phones are not yet) === >> "%LOG%"
exit /b 1
:fail
echo === FAILED (nothing was published) === >> "%LOG%"
exit /b 1
