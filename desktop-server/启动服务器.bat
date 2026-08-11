@echo off
chcp 65001 >nul
cd /d "%~dp0"
title CAT 工作台本地服务器
echo.
echo  ========================================
echo    CAT 工作台 - 本地服务器
echo  ========================================
echo.
echo  正在启动服务器...
echo  浏览器将自动打开 http://localhost:8765
echo.
echo  关闭此窗口即可停止服务器。
echo.
start "" "http://localhost:8765"
node "server.mjs"
pause
