@echo off
setlocal enabledelayedexpansion

echo ============================================
echo  NODE SETUP + FRONTEND INSTALL
echo ============================================
echo.

set "ROOT=%~dp0"
set "ROOT=%ROOT:~0,-1%"
set "TOOLS_NODE=%ROOT%\tools\node"
set "FRONTEND=%ROOT%\master_dashboard\frontend"

set "NODE_ZIP="
for %%f in ("%ROOT%\extras\node*.zip") do set "NODE_ZIP=%%f"

if "%NODE_ZIP%"=="" (
    echo ERROR: No node*.zip found in %ROOT%\extras\
    echo Place the node-vXX.XX.X-win-x64.zip file in the extras\ folder.
    pause
    exit /b 1
)
echo Found: %NODE_ZIP%
echo.

if exist "%TOOLS_NODE%" (
    echo Removing existing tools\node ...
    rmdir /s /q "%TOOLS_NODE%"
    if exist "%TOOLS_NODE%" (
        echo ERROR: Could not remove %TOOLS_NODE% - close any programs using it.
        pause
        exit /b 1
    )
)

echo Extracting node to tools\ ...
if not exist "%ROOT%\tools" mkdir "%ROOT%\tools"
tar -xf "%NODE_ZIP%" -C "%ROOT%\tools"
if %errorlevel% neq 0 (
    echo tar failed, trying Python fallback...
    python -c "import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); z.extractall(sys.argv[2]); z.close()" "%NODE_ZIP%" "%ROOT%\tools"
    if %errorlevel% neq 0 (
        echo ERROR: Could not extract node zip. Ensure Python or tar is available.
        pause
        exit /b 1
    )
)

set "EXTRACTED_DIR="
for /d %%d in ("%ROOT%\tools\node-*") do set "EXTRACTED_DIR=%%d"

if "%EXTRACTED_DIR%"=="" (
    echo ERROR: Could not find extracted node directory in tools\
    pause
    exit /b 1
)

echo Renaming %EXTRACTED_DIR% to tools\node ...
rename "%EXTRACTED_DIR%" "node"
if %errorlevel% neq 0 (
    echo ERROR: Rename failed.
    pause
    exit /b 1
)

if not exist "%TOOLS_NODE%\node.exe" (
    echo ERROR: node.exe not found after extraction. Zip may be corrupt.
    pause
    exit /b 1
)

echo Node extracted successfully.
"%TOOLS_NODE%\node.exe" --version
echo.

echo Installing frontend dependencies...
echo Target: %FRONTEND%
echo.

cd /d "%FRONTEND%"

set "npm_config_prefix=%TOOLS_NODE%"
set "npm_config_cache=%TOOLS_NODE%\.npm-cache"
set "NODE_PATH=%TOOLS_NODE%\node_modules"
set "PATH=%TOOLS_NODE%;%PATH%"

"%TOOLS_NODE%\node.exe" "%TOOLS_NODE%\node_modules\npm\bin\npm-cli.js" install --legacy-peer-deps

echo.
if %errorlevel%==0 (
    echo ============================================
    echo  SUCCESS: Node setup and install complete.
    echo ============================================
) else (
    echo ============================================
    echo  FAILED. Check errors above.
    echo ============================================
)
pause
endlocal
