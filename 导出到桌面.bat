@echo off
setlocal enabledelayedexpansion

set PROJECT_DIR=%~dp0

for /f "delims=" %%i in ('powershell -NoProfile -Command "[Environment]::GetFolderPath('Desktop')"') do set DESKTOP=%%i

echo.
echo ========================================
echo   CAT Build and Export to Desktop
echo ========================================
echo.
echo  Desktop: %DESKTOP%
echo.

set FOLDER_NAME=
set /p FOLDER_NAME=Enter folder name (default: CAT-Platform): 
if "%FOLDER_NAME%"=="" set FOLDER_NAME=CAT-Platform

set DEST=%DESKTOP%\%FOLDER_NAME%

echo.
echo [1/4] Cleaning dist folder...
echo ----------------------------------------
if exist "%PROJECT_DIR%dist" rmdir /s /q "%PROJECT_DIR%dist"

echo.
echo [2/4] Building project...
echo ----------------------------------------
cd /d "%PROJECT_DIR%"
call npm run build

echo.
echo [3/4] Verifying build output...
echo ----------------------------------------
if not exist "%PROJECT_DIR%dist\index.html" (
    echo [ERROR] dist\index.html not found - build failed.
    echo Aborting - desktop not touched.
    echo.
    pause
    exit /b 1
)
if not exist "%PROJECT_DIR%dist\assets" (
    echo [ERROR] dist\assets\ not found - build failed.
    echo Aborting - desktop not touched.
    echo.
    pause
    exit /b 1
)

echo [OK] Build verified: index.html + assets\ present.

echo.
echo [4/4] Cleaning old folder and copying to desktop...
echo ----------------------------------------
if exist "%DEST%" rmdir /s /q "%DEST%"
mkdir "%DEST%" 2>nul

xcopy /E /I /Y /Q "%PROJECT_DIR%dist\*" "%DEST%\" >nul
if errorlevel 1 (
    echo [ERROR] Copy failed.
    pause
    exit /b 1
)

echo.
echo ========================================
echo  [DONE] Exported to: %DEST%
echo ========================================
echo.
dir /b "%DEST%"
echo.
pause
