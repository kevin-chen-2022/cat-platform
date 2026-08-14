@echo off
setlocal enabledelayedexpansion

set PROJECT_DIR=%~dp0
cd /d "%PROJECT_DIR%"

echo.
echo ========================================
echo   One-Click Sync to GitHub
echo ========================================
echo.

REM ---------- [1] Check git is available ----------
echo [1/6] Checking git...
git --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] git not found in PATH. Install git for Windows first.
    echo         https://git-scm.com/download/win
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('git --version 2^>nul') do echo   %%i

REM ---------- [2] Check remote origin ----------
echo.
echo [2/6] Checking remote...
set REMOTE_URL=
for /f "tokens=*" %%i in ('git config --get remote.origin.url 2^>nul') do set REMOTE_URL=%%i
if "%REMOTE_URL%"=="" (
    echo [ERROR] No remote 'origin' configured.
    echo   Set it manually:
    echo     git remote add origin https://github.com/USER/REPO.git
    echo.
    pause
    exit /b 1
)
echo   Remote: %REMOTE_URL%

REM ---------- [3] Check working tree ----------
echo.
echo [3/6] Checking working tree...
set STATUS_SHORT=
for /f "delims=" %%i in ('git status --short 2^>nul ^| find /c /v ""') do set STATUS_SHORT=%%i
echo   Changed files: %STATUS_SHORT%
if "%STATUS_SHORT%"=="0" (
    echo   No changes to commit. Exiting.
    echo.
    pause
    exit /b 0
)
echo.
git status --short

set CONFIRM=
set /p CONFIRM=Continue with these files? (Y/n): 
if /i "%CONFIRM%"=="n" (
    echo Aborted.
    echo.
    pause
    exit /b 0
)

REM ---------- [4] Stage & commit ----------
echo.
echo [4/6] Staging all changes (respecting .gitignore)...
git add -A

set COMMIT_MSG=
set /p COMMIT_MSG=Enter commit message (default: auto-sync): 
if "%COMMIT_MSG%"=="" set COMMIT_MSG=auto-sync

echo.
echo   Committing: %COMMIT_MSG%
git commit -m "%COMMIT_MSG%"
if errorlevel 1 (
    echo [WARN] Commit may have empty changes. Continuing push anyway if there are local commits...
)

REM ---------- [5] Pull with rebase to integrate remote updates ----------
echo.
echo [5/6] Pulling remote changes (rebase)...
git pull --rebase origin master
if errorlevel 1 (
    REM Fallback: try main branch (newer GitHub default)
    echo   Retrying with 'main' branch...
    git pull --rebase origin main
)
if errorlevel 1 (
    echo.
    echo [ERROR] Pull/rebase failed or conflict detected.
    echo   1. Resolve conflicts manually, then:
    echo      git add ^<resolved-files^>
    echo      git rebase --continue
    echo   2. Or abort: git rebase --abort
    echo.
    pause
    exit /b 1
)

REM ---------- [6] Push ----------
echo.
echo [6/6] Pushing to origin...
REM Use credential helper; if not configured, interactive prompt appears
git push origin master
if errorlevel 1 (
    REM Fallback: try main
    echo   Retrying with 'main' branch...
    git push origin main
)
if errorlevel 1 (
    echo.
    echo [ERROR] Push failed. Common causes:
    echo   - Authentication required ^(use GitHub Personal Access Token^)
    echo   - Network issue / GitHub down
    echo   - Non-fast-forward ^(should have been fixed by rebase step^)
    echo.
    pause
    exit /b 1
)

echo.
echo ========================================
echo  [DONE] Synced to: %REMOTE_URL%
echo ========================================
echo.
pause
