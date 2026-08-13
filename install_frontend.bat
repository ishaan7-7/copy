@echo off
setlocal

set "NODE_DIR=%~dp0tools\node"
set "FRONTEND_DIR=%~dp0master_dashboard\frontend"
set "PATH=%NODE_DIR%;%PATH%"
set "npm_config_prefix=%NODE_DIR%"
set "npm_config_cache=%NODE_DIR%\.npm-cache"
set "NODE_PATH=%NODE_DIR%\node_modules"

echo Node: %NODE_DIR%\node.exe
echo Target: %FRONTEND_DIR%
echo.

cd /d "%FRONTEND_DIR%"
"%NODE_DIR%\node.exe" "%NODE_DIR%\node_modules\npm\bin\npm-cli.js" install --legacy-peer-deps

echo.
if %errorlevel%==0 (
    echo SUCCESS: Frontend dependencies installed.
) else (
    echo FAILED. Error code: %errorlevel%
)
pause
endlocal
