@echo off
chcp 65001 >nul
SETLOCAL
setlocal enabledelayedexpansion

rem ============================================================
rem   CAT 工作台 - 发布到 GitHub 仓库（可复用 / 3次重试版）
rem   仓库: https://github.com/kevin-chen-2022/cat-platform
rem
rem   特性：
rem     1. 提前检测 git / 项目路径 / user.name&email（失败早退出）
rem     2. 自动 init、配置远程、写入完整 .gitignore
rem     3. push 失败自动重试 3 次（间隔 5s / 10s）
rem     4. 3 次都失败：在屏幕打印 + 落盘 "MANUAL-GIT-PUSH.txt"
rem        （内含 cd 绝对路径 + 每一步命令 + 解释 + 常见报错处理）
rem ============================================================

echo ============================================================
echo   CAT 工作台 - 发布到 GitHub
echo   仓库: https://github.com/kevin-chen-2022/cat-platform
echo ============================================================
echo.

set SRC_DIR=%~dp0
if "%SRC_DIR:~-1%"=="\" set SRC_DIR=%SRC_DIR:~0,-1%
set REPO_URL=https://github.com/kevin-chen-2022/cat-platform.git
set MANUAL_FILE=%SRC_DIR%\MANUAL-GIT-PUSH.txt
set COMMIT_MSG=

rem ---------- 1. Git 安装检查 ----------
echo [1/7] 检查 Git...
where git >nul 2>nul
if %errorlevel% neq 0 (
    echo   [错误] 未检测到 Git，请先安装：https://git-scm.com/download/win
    echo          安装后请重开本脚本。
    pause
    exit /b 1
)
for /f "delims=" %%v in ('git --version') do set GV=%%v
echo   [OK] !GV!

rem ---------- 2. 项目根目录检查（以 package.json + src\ 目录作为标识） ----------
echo.
echo [2/7] 检查项目目录...
if not exist "%SRC_DIR%\package.json" (
    echo   [错误] 未找到 package.json，当前路径不是项目根目录：
    echo          %SRC_DIR%
    echo          请将本脚本放在项目根目录下双击运行。
    pause
    exit /b 1
)
echo   [OK] 项目根目录：%SRC_DIR%
cd /d "%SRC_DIR%"

rem ---------- 3. user.name / user.email 提前检查（只查仓库级+全局，不写全局） ----------
echo.
echo [3/7] 检查 Git 提交身份...
set UNAME=
set UMAIL=
for /f "delims=" %%u in ('git config user.name 2^>nul') do set UNAME=%%u
for /f "delims=" %%e in ('git config user.email 2^>nul') do set UMAIL=%%e
if "!UNAME!"=="" (
    echo   [错误] 未设置 git user.name，提交会失败。
    echo          请先执行（把引号内换成你自己的，--global 是可选，建议去掉只影响本仓库）：
    echo          git config user.name "kevin-chen-2022"
    echo          git config user.email "your@real-email.com"
    pause
    exit /b 1
)
if "!UMAIL!"=="" set UMAIL=^<未设置^>
echo   [OK] user.name=!UNAME!   user.email=!UMAIL!

rem ---------- 4. 初始化 Git 仓库（如未 init） ----------
echo.
echo [4/7] Git 仓库...
if not exist "%SRC_DIR%\.git" (
    echo   尚未初始化，正在 git init ...
    git init
    if !errorlevel! neq 0 (
        echo   [错误] git init 失败。
        pause
        exit /b 1
    )
    git branch -M main
    echo   [OK] 仓库已初始化，默认分支 main。
) else (
    echo   [OK] Git 仓库已存在。
    for /f "delims=" %%b in ('git branch --show-current 2^>nul') do set CUR_BRANCH=%%b
    if "!CUR_BRANCH!"=="" set CUR_BRANCH=main
    echo   当前分支：!CUR_BRANCH!
)
for /f "delims=" %%b in ('git branch --show-current 2^>nul') do set CUR_BRANCH=%%b
if "!CUR_BRANCH!"=="" set CUR_BRANCH=main

rem ---------- 5. 配置远程仓库 ----------
echo.
echo [5/7] 远程仓库...
set NEED_PUSH_U=0
git remote get-url origin >nul 2>nul
if !errorlevel! equ 0 (
    for /f "delims=" %%U in ('git remote get-url origin 2^>nul') do set CURRENT_URL=%%U
    if /I not "!CURRENT_URL!"=="%REPO_URL%" (
        echo   当前远程：!CURRENT_URL!
        echo   更新为  ：%REPO_URL%
        git remote set-url origin %REPO_URL%
    ) else (
        echo   [OK] 已配置：%REPO_URL%
    )
) else (
    git remote add origin %REPO_URL%
    set NEED_PUSH_U=1
    echo   [OK] 已添加 origin：%REPO_URL%
)

rem ---------- 6. 写入/校验 .gitignore ----------
echo.
echo [6/7] .gitignore 排除规则...
call :WRITE_GITIGNORE
rem 如果之前把不该暂存的文件（dist/node_modules 等）误加进了索引，这里清一下
git rm -r --cached dist dist-ssr node_modules .vite >nul 2>nul
echo   [OK] 已写入完整 .gitignore，并清理缓存中的构建产物/依赖。

rem ---------- 7. 暂存 + 提交 ----------
echo.
echo [7/7] 暂存变更并提交...

rem 尝试同步远程（非阻塞：失败就继续，可能首次推送）
echo   - 同步远程最新代码（允许失败）...
git fetch origin %CUR_BRANCH% >nul 2>nul
if !errorlevel! equ 0 (
    git merge --no-edit --ff origin/%CUR_BRANCH% >nul 2>nul
    if !errorlevel! equ 0 (
        echo     [OK] 已与远程同步。
    ) else (
        echo     [提示] 远程可能为空或存在未拉冲突，继续本地提交。
    )
) else (
    echo     [提示] 未 fetch 到远程（可能首次推送/离线），继续本地提交。
)

git add -A

git diff --cached --quiet
if !errorlevel! equ 0 (
    echo   [提示] 暂存区为空，没有需要提交的变更。
    set JUST_COMMIT=0
) else (
    rem 生成带日期时间的提交信息（wmic 方式跨中文 Windows 稳定）
    for /f "tokens=2 delims==" %%a in ('wmic os get localdatetime /value 2^>nul ^| find "="') do set DT=%%a
    set YYYY=!DT:~0,4!
    set MM=!DT:~4,2!
    set DD=!DT:~6,2!
    set HH=!DT:~8,2!
    set MI=!DT:~10,2!
    set COMMIT_MSG=Update !YYYY!-!MM!-!DD! !HH!:!MI!

    git commit -m "!COMMIT_MSG!"
    if !errorlevel! neq 0 (
        echo.
        echo   [错误] git commit 失败。
        echo          检查上方日志，常见原因：
        echo            1) 没有 user.email（上面已检测应该不会）
        echo            2) 合并冲突需要手动解决
        pause
        exit /b 1
    )
    set JUST_COMMIT=1
    echo   [OK] 已提交：!COMMIT_MSG!
)

rem ---------- 8. Push：3 次重试 ----------
echo.
echo ============================================================
echo   推送到 GitHub（共 3 次尝试机会）
echo ============================================================

set ATTEMPT=1
set PUSH_OK=0
set LAST_PUSH_ERR=

:PUSH_LOOP
if %ATTEMPT% gtr 3 goto PUSH_FAILED

echo.
echo --- 第 %ATTEMPT%/3 次推送 ---
if %ATTEMPT% geq 2 (
    set /a WAIT=5
    if %ATTEMPT%==3 set /a WAIT=10
    echo   等待 !WAIT! 秒后重试 ...
    ping -n !WAIT! 127.0.0.1 >nul
)

if %NEED_PUSH_U%==1 (
    git push -u origin %CUR_BRANCH%
) else (
    git push origin %CUR_BRANCH%
)
set ERR=%errorlevel%
if %ERR% equ 0 (
    set PUSH_OK=1
    goto PUSH_SUCCESS
)
set LAST_PUSH_ERR=退出码 %ERR%
echo   [!ATTEMPT!/3] 推送失败 (!LAST_PUSH_ERR!)。

set /a ATTEMPT+=1
goto PUSH_LOOP


:PUSH_SUCCESS
echo.
echo ============================================================
echo   成功推送到 GitHub !
echo   仓库  ：https://github.com/kevin-chen-2022/cat-platform
echo   分支  ：%CUR_BRANCH%
if "!COMMIT_MSG!" neq "" echo   提交  ：!COMMIT_MSG!
echo ============================================================
echo.
choice /C YN /N /M "是否在浏览器打开仓库？(Y/N): "
if %errorlevel%==1 start https://github.com/kevin-chen-2022/cat-platform
goto CLEAN_EXIT


:PUSH_FAILED
echo.
echo ============================================================
echo   [失败] 连续 3 次推送均未成功。
echo   最近一次：!LAST_PUSH_ERR!
echo   常见原因：
echo     1. GitHub 凭据过期 / 未登录（用 GitHub Desktop 登录一次即可）
echo     2. 网络或 DNS 不稳定（过一会再试，或切换网络）
echo     3. 远程有本地未拉取的冲突提交（先手动 pull）
echo     4. 仓库权限问题（检查你是否有写权限）
echo.
echo ============================================================
echo   手动推送步骤（复制下面命令按顺序执行即可）：
echo ============================================================
call :PRINT_MANUAL_STEPS TO_CONSOLE

rem 同时把手动步骤落盘，方便随时查看
call :PRINT_MANUAL_STEPS TO_FILE "%MANUAL_FILE%"
echo.
echo   [OK] 手动步骤已保存到：
echo        %MANUAL_FILE%
echo.
echo   等你方便时，直接打开上面文件按步骤执行即可；
echo   或者也可以直接双击本脚本再试（网络好时可能就过了）。
pause
goto CLEAN_EXIT


:CLEAN_EXIT
ENDLOCAL
exit /b 0

rem ============================================================
rem   子过程：写入完整 .gitignore（用更全的规则覆盖）
rem ============================================================
:WRITE_GITIGNORE
(
echo # ====== 依赖 ======
echo node_modules
echo .npm
echo .yarn
echo .pnpm-store
echo.
echo # ====== 构建产物 / 缓存 ======
echo dist
echo dist-ssr
echo build
echo out
echo .vite
echo *.tsbuildinfo
echo *.local
echo.
echo # ====== 日志 ======
echo logs
echo *.log
echo npm-debug.log*
echo yarn-debug.log*
echo yarn-error.log*
echo pnpm-debug.log*
echo lerna-debug.log*
echo.
echo # ====== 系统 / 编辑器临时文件 ======
echo .vscode/*
echo !.vscode/extensions.json
echo .idea
echo .DS_Store
echo Thumbs.db
echo ehthumbs.db
echo Desktop.ini
echo *.suo
echo *.ntvs*
echo *.njsproj
echo *.sln
echo *.sw?
echo *.tmp
echo *~
echo.
echo # ====== 备份文件与原始副本 ======
echo *.bak
echo *-原始.*
echo *.备份.*
echo.
echo # ====== 单文件 / 桌面导出产物（需要时重新构建，不进仓库） ======
echo *-单文件.html
echo *-standalone.html
echo MANUAL-PUSH-README.txt
echo MANUAL-GIT-PUSH.txt
echo cat-platform-*.zip
echo.
echo # ====== Tauri / 桌面端缓存 ======
echo .tauri-temp
echo src-tauri/target
echo src-tauri/Cargo.lock
echo src-tauri/gen
echo.
echo # ====== 浏览器截图 / 临时截图缓存 ======
echo screenshots
echo *.png.tmp
) > "%SRC_DIR%\.gitignore"
exit /b 0

rem ============================================================
rem   子过程：打印手动推送到控制台 或 落盘到文件
rem   用法：call :PRINT_MANUAL_STEPS TO_CONSOLE
rem         call :PRINT_MANUAL_STEPS TO_FILE "路径"
rem ============================================================
:PRINT_MANUAL_STEPS
set MODE=%1
if /I "%MODE%"=="TO_FILE" (
    set OUT_TARGET=%2
    goto PRINT_TO_FILE
)

:PRINT_TO_CONSOLE
echo.
echo   cd /d "%SRC_DIR%"
echo.
echo   rem ^(1^) 确认远程地址和分支
echo   git remote -v
echo   git branch --show-current
echo.
echo   rem ^(2^) 如需先同步远程有冲突时，用这个（首次推送可跳过）
echo   git fetch origin main
echo   rem git pull origin main --no-rebase
echo.
echo   rem ^(3^) 暂存并提交（若之前已经 commit 过，再次 add/commit 也没事）
echo   git add -A
echo   if "!COMMIT_MSG!"=="" (
echo     git commit -m "Update"
echo   ) else (
echo     git commit -m "!COMMIT_MSG!"
echo   )
echo.
echo   rem ^(4^) 推送到 main 分支（首次加 -u，之后可以不加）
if %NEED_PUSH_U%==1 (
echo   git push -u origin main
) else (
echo   git push origin main
)
echo.
echo   rem ^( 如果报 "fatal: Authentication failed"：
echo   rem     用 GitHub Desktop 登录一次，或运行 "git config credential.helper manager" ^)
echo.
exit /b 0

:PRINT_TO_FILE
(
echo ============================================================
echo   GitHub 手动推送步骤 - CAT 工作台
echo   生成时间：%date% %time%
echo   仓库  ：%REPO_URL%
echo ============================================================
echo.
echo [说明]
echo   发布脚本自动推送 3 次都失败后，为你留下这份手推代码。
echo   任意一个 cmd 窗口里按顺序复制粘贴下面命令即可。
echo   （cd 路径已自动填成当前项目的绝对路径，不用改）
echo.
echo ============================================================
echo   第 0 步：打开命令行
echo ============================================================
echo   - Win+R 输入 cmd，回车，弹出黑窗口后把下面的命令按顺序贴进去。
echo   - 或者在当前目录空白处按住 Shift+右键 -^> "在此处打开命令行窗口"。
echo.
echo ============================================================
echo   第 1 步：进入项目目录（路径已填好，直接复制）
echo ============================================================
echo cd /d "%SRC_DIR%"
echo.
echo ============================================================
echo   第 2 步：确认仓库地址和当前分支（不一定要执行，核对用）
echo ============================================================
echo git remote -v
echo git branch --show-current
echo.
echo   ^>^> 远程 origin 应该是：%REPO_URL%
echo   ^>^> 分支应该是 main（如显示 master 也无所谓，最后一步 push 时改成相应名即可）
echo.
echo ============================================================
echo   第 3 步：可选 - 同步远程（远程已有新提交时才需要）
echo ============================================================
echo rem 首次推送跳过这一步，直接走第 4 步
echo git fetch origin main
echo git pull origin main --no-rebase
echo.
echo ============================================================
echo   第 4 步：暂存并提交
echo ============================================================
echo git add -A
if "!COMMIT_MSG!"=="" (
echo git commit -m "Update"
) else (
echo git commit -m "!COMMIT_MSG!"
)
echo.
echo   如果这一步报 "nothing to commit"，说明之前已经 commit 过了，没关系，继续走第 5 步。
echo.
echo ============================================================
echo   第 5 步：推送到 GitHub
echo ============================================================
if %NEED_PUSH_U%==1 (
echo git push -u origin main
) else (
echo git push origin main
)
echo.
echo ============================================================
echo   常见报错处理
echo ============================================================
echo.
echo 1) "fatal: Authentication failed" / "Logon failed"
echo    - 打开 GitHub Desktop，登录你的 GitHub 账号后再重试上面的 push 即可。
echo    - 或者安装 Git Credential Manager：https://github.com/git-ecosystem/git-credential-manager
echo.
echo 2) "fatal: unable to access '...': Could not resolve host"
echo    - 网络或 DNS 问题。切换网络、重启路由器、过几分钟再试。
echo    - 或手动设置 DNS：114.114.114.114 和 8.8.8.8。
echo.
echo 3) "rejected (non-fast-forward)"
echo    - 远程有你本地还没拉的提交。回到第 3 步先 fetch+pull，解决冲突再 push。
echo.
echo 4) "Permission denied (publickey)" / 403 Forbidden
echo    - 你的 GitHub 账号没有这个仓库的写权限，联系仓库所有者邀请你加入 Collaborators。
echo    - 或者你用 HTTPS 推送时没有输正确的 Personal Access Token。
echo.
echo 5) 如果之前远程 URL 被 ghproxy 之类代理改写了，用这两条改回来：
echo    git config --unset-all url."https://ghproxy.com/https://github.com/".insteadOf
echo    git remote set-url origin %REPO_URL%
echo.
echo ============================================================
echo   仍然失败怎么办？
echo ============================================================
echo - 直接再双击一次 PUBLISH-TO-GITHUB.bat，网络通畅可能就过了
echo - 或者用 GitHub Desktop 打开本项目直接点 "Push origin" 按钮
echo - 或者联系仓库作者
echo.
) > "%OUT_TARGET%"
exit /b 0
