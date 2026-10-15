@echo off
chcp 65001 >nul
cd /d "%~dp0"
cls
set LOG=%TEMP%\keke-fix-push.txt
echo KEKE Manager - fix and push > "%LOG%"
echo. >> "%LOG%"

echo ==================================================
echo   KEKE Manager  -  Fix the stuck rebase and push
echo ==================================================
echo.

echo [1/7] Clearing the interrupted rebase...
echo --- state before --- >> "%LOG%"
git log --oneline -4 >> "%LOG%" 2>&1
git rebase --abort >> "%LOG%" 2>&1
if exist ".git\rebase-merge" rmdir /s /q ".git\rebase-merge"
if exist ".git\rebase-apply" rmdir /s /q ".git\rebase-apply"

echo [2/7] Rewinding the two bad commits (keeping the work)...
git reset --soft 47e6cae516a1d3bd0c20d721b103e4a7696af089 >> "%LOG%" 2>&1
git reset >> "%LOG%" 2>&1

echo [3/7] Ignoring build output...
findstr /C:"output/" .gitignore >nul 2>&1 || echo output/>> .gitignore
findstr /C:"push-log.txt" .gitignore >nul 2>&1 || echo push-log.txt>> .gitignore
findstr /C:"eas-submit-ios.log" .gitignore >nul 2>&1 || echo eas-submit-ios.log>> .gitignore
findstr /C:".tmp-deploy-out.txt" .gitignore >nul 2>&1 || echo .tmp-deploy-out.txt>> .gitignore

echo [4/7] Staging the 8 real files...
git add .gitignore scripts/seoBuildMeta.mjs scripts/prerender-seo-routes.mjs scripts/build-blog.mjs lib/seoLandingPages.json lib/seoLandingPages.ts lib/seoLandingMeta.ts public/llms.txt >> "%LOG%" 2>&1
echo --- staged --- >> "%LOG%"
git status --short >> "%LOG%" 2>&1

echo [5/7] Committing...
git commit -m "SEO/GEO: tourist transport platform category page and honest driver count" >> "%LOG%" 2>&1

echo [6/7] Pulling from GitHub...
git -c rebase.autoStash=true pull --rebase origin master >> "%LOG%" 2>&1
if errorlevel 1 goto :fail

echo [7/7] Pushing...
git push origin master >> "%LOG%" 2>&1
if errorlevel 1 goto :fail

echo --- state after --- >> "%LOG%"
git log --oneline -4 >> "%LOG%" 2>&1
git status --short >> "%LOG%" 2>&1
copy /y "%LOG%" "%~dp0push-log.txt" >nul

echo.
echo ==================================================
echo  DONE - pushed successfully.
echo  Cloudflare will now rebuild the website.
echo ==================================================
pause
exit /b 0

:fail
echo --- FAILED --- >> "%LOG%"
git status --short >> "%LOG%" 2>&1
git log --oneline -4 >> "%LOG%" 2>&1
copy /y "%LOG%" "%~dp0push-log.txt" >nul
echo.
echo ==================================================
echo  Still failed - nothing is lost.
echo  Tell Claude "ver gaigzavna" and he will read the log.
echo ==================================================
pause
exit /b 1
