@echo off
setlocal enabledelayedexpansion

echo ============================================
echo  STREAMING EMULATOR — SETUP SCRIPT
echo ============================================
echo.

set "ROOT=%~dp0"
set "ROOT=%ROOT:~0,-1%"

REM ── Step 0: Check Python ──
echo [STEP 0] Checking Python...
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python is not installed or not in PATH.
    echo Download Python 3.13 from: https://www.python.org/downloads/
    echo Make sure to check "Add Python to PATH" during installation.
    pause
    exit /b 1
)
for /f "tokens=2 delims= " %%v in ('python --version 2^>^&1') do set PYVER=%%v
echo   Found Python %PYVER%

REM ── Step 1: Check extras folder ──
echo.
echo [STEP 1] Checking extras folder...
if not exist "%ROOT%\extras" (
    echo ERROR: extras folder not found.
    echo Create extras\ and place these files:
    echo   - kafka_2.12-3.7.1.tgz
    echo   - java.zip
    echo   - node-v24.13.1-win-x64.zip
    pause
    exit /b 1
)

set KAFKA_TGZ=
for %%f in ("%ROOT%\extras\kafka*.tgz") do set KAFKA_TGZ=%%f
set JAVA_ZIP=
for %%f in ("%ROOT%\extras\java*.zip") do set JAVA_ZIP=%%f
set NODE_ZIP=
for %%f in ("%ROOT%\extras\node*.zip") do set NODE_ZIP=%%f

if "%KAFKA_TGZ%"=="" echo   WARNING: No kafka .tgz found in extras\
if "%JAVA_ZIP%"=="" echo   WARNING: No java .zip found in extras\
if "%NODE_ZIP%"=="" echo   WARNING: No node .zip found in extras\
echo   Extras check complete.

REM ── Step 2: Create .venv (pipeline) ──
echo.
echo [STEP 2] Creating .venv (pipeline)...
if not exist "%ROOT%\.venv\Scripts\python.exe" (
    python -m venv "%ROOT%\.venv"
    echo   .venv created.
) else (
    echo   .venv already exists, skipping.
)
echo   Installing pipeline dependencies...
"%ROOT%\.venv\Scripts\pip.exe" install -r "%ROOT%\requirements.txt" --quiet
echo   Pipeline dependencies installed.

REM ── Step 3: Create .venv_dash (dashboard backend) ──
echo.
echo [STEP 3] Creating .venv_dash (dashboard backend)...
if not exist "%ROOT%\master_dashboard\.venv_dash\Scripts\python.exe" (
    python -m venv "%ROOT%\master_dashboard\.venv_dash"
    echo   .venv_dash created.
) else (
    echo   .venv_dash already exists, skipping.
)
echo   Installing dashboard dependencies...
"%ROOT%\master_dashboard\.venv_dash\Scripts\pip.exe" install -r "%ROOT%\master_dashboard\requirements.txt" --quiet
echo   Dashboard dependencies installed.

REM ── Step 4: Extract Kafka ──
echo.
echo [STEP 4] Extracting Kafka...
if not "%KAFKA_TGZ%"=="" (
    if not exist "%ROOT%\kafka" (
        echo   Extracting %KAFKA_TGZ%...
        "%ROOT%\.venv\Scripts\python.exe" -c "import tarfile,sys; t=tarfile.open(sys.argv[1],'r:gz'); t.extractall(sys.argv[2]); t.close()" "%KAFKA_TGZ%" "%ROOT%"
        REM Rename extracted folder to kafka
        for /d %%d in ("%ROOT%\kafka_2*") do (
            rename "%%d" "kafka"
        )
        echo   Kafka extracted.
    ) else (
        echo   kafka\ already exists, skipping.
    )
) else (
    echo   SKIPPED: No kafka .tgz in extras\.
)

REM ── Step 5: Patch Kafka config for Windows ──
echo.
echo [STEP 5] Patching Kafka config...
if exist "%ROOT%\kafka\config\server.properties" (
    "%ROOT%\.venv\Scripts\python.exe" -c "p='%ROOT%\\kafka\\config\\server.properties'.replace('\\\\','/'); lines=open(p).readlines(); f=open(p,'w'); [f.write(l.replace('log.dirs=/tmp/kafka-logs','log.dirs=C:/tmp/kafka-logs')) if 'log.dirs=' in l else f.write(l) for l in lines]; f.close()"
    echo   server.properties patched: log.dirs=C:/tmp/kafka-logs
)
if exist "%ROOT%\kafka\config\zookeeper.properties" (
    "%ROOT%\.venv\Scripts\python.exe" -c "p='%ROOT%\\kafka\\config\\zookeeper.properties'.replace('\\\\','/'); lines=open(p).readlines(); f=open(p,'w'); [f.write(l.replace('dataDir=/tmp/zookeeper','dataDir=C:/tmp/zookeeper-data')) if 'dataDir=' in l else f.write(l) for l in lines]; f.close()"
    echo   zookeeper.properties patched: dataDir=C:/tmp/zookeeper-data
)

REM ── Step 6: Extract Java ──
echo.
echo [STEP 6] Extracting Java...
if not "%JAVA_ZIP%"=="" (
    set JAVA_FOUND=0
    for /d %%d in ("%ROOT%\jdk-*") do set JAVA_FOUND=1
    if "!JAVA_FOUND!"=="0" (
        echo   Extracting %JAVA_ZIP%...
        "%ROOT%\.venv\Scripts\python.exe" -c "import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); z.extractall(sys.argv[2]); z.close()" "%JAVA_ZIP%" "%ROOT%"
        echo   Java extracted.
    ) else (
        echo   jdk-* already exists, skipping.
    )
) else (
    echo   SKIPPED: No java .zip in extras\.
)

REM ── Step 7: Extract Node.js ──
echo.
echo [STEP 7] Extracting Node.js...
if not "%NODE_ZIP%"=="" (
    if not exist "%ROOT%\tools\node\node.exe" (
        echo   Extracting %NODE_ZIP%...
        "%ROOT%\.venv\Scripts\python.exe" -c "import zipfile,sys,shutil,os; z=zipfile.ZipFile(sys.argv[1]); z.extractall(sys.argv[2]); z.close(); extracted=[d for d in os.listdir(sys.argv[2]) if d.startswith('node-')]; src=os.path.join(sys.argv[2],extracted[0]) if extracted else None; dst=os.path.join(sys.argv[2],'node'); shutil.move(src,dst) if src and not os.path.exists(dst) else None" "%NODE_ZIP%" "%ROOT%\tools"
        echo   Node.js extracted to tools\node\.
    ) else (
        echo   tools\node\ already exists, skipping.
    )
) else (
    echo   SKIPPED: No node .zip in extras\.
)

REM ── Step 8: Create tmp directories ──
echo.
echo [STEP 8] Creating tmp directories...
if not exist "%ROOT%\tmp\kafka-logs" mkdir "%ROOT%\tmp\kafka-logs"
if not exist "%ROOT%\tmp\zookeeper-data" mkdir "%ROOT%\tmp\zookeeper-data"
echo   tmp\kafka-logs\ and tmp\zookeeper-data\ created.

REM ── Step 9: Create data directories ──
echo.
echo [STEP 9] Creating data directories...
if not exist "%ROOT%\data\delta\bronze" mkdir "%ROOT%\data\delta\bronze"
if not exist "%ROOT%\data\delta\silver" mkdir "%ROOT%\data\delta\silver"
if not exist "%ROOT%\data\delta\gold\vehicle_health" mkdir "%ROOT%\data\delta\gold\vehicle_health"
if not exist "%ROOT%\data\delta\gold\alerts" mkdir "%ROOT%\data\delta\gold\alerts"
if not exist "%ROOT%\data\checkpoints" mkdir "%ROOT%\data\checkpoints"
if not exist "%ROOT%\data\spark-warehouse" mkdir "%ROOT%\data\spark-warehouse"
if not exist "%ROOT%\data\vehicles" mkdir "%ROOT%\data\vehicles"
if not exist "%ROOT%\logs" mkdir "%ROOT%\logs"
if not exist "%ROOT%\alerts_service\state" mkdir "%ROOT%\alerts_service\state"
if not exist "%ROOT%\gold_service\state" mkdir "%ROOT%\gold_service\state"
if not exist "%ROOT%\inference_service\state" mkdir "%ROOT%\inference_service\state"
if not exist "%ROOT%\writer_service\state" mkdir "%ROOT%\writer_service\state"
if not exist "%ROOT%\analytics_service\state" mkdir "%ROOT%\analytics_service\state"
if not exist "%ROOT%\ingest\dlq" mkdir "%ROOT%\ingest\dlq"
if not exist "%ROOT%\replay\dlq" mkdir "%ROOT%\replay\dlq"
if not exist "%ROOT%\replay\checkpoints" mkdir "%ROOT%\replay\checkpoints"
echo   All data directories created.

REM ── Step 10: npm install for frontend ──
echo.
echo [STEP 10] Installing frontend dependencies...
if exist "%ROOT%\tools\node\npm.cmd" (
    set "PATH=%ROOT%\tools\node;%PATH%"
    cd /d "%ROOT%\master_dashboard\frontend"
    call "%ROOT%\tools\node\npm.cmd" install --legacy-peer-deps
    cd /d "%ROOT%"
    echo   Frontend dependencies installed.
) else (
    echo   SKIPPED: tools\node\npm.cmd not found. Extract Node.js first.
)

echo.
echo ============================================
echo  SETUP COMPLETE
echo ============================================
echo.
echo  MANUAL STEPS REQUIRED:
echo.
echo  1. Move folders to C:\ drive:
echo     move "%ROOT%\kafka" "C:\kafka"
echo     move "%ROOT%\tmp" "C:\tmp"
echo.
echo  2. Move Java to C:\ drive:
for /d %%d in ("%ROOT%\jdk-*") do echo     move "%%d" "C:\%%~nxd"
echo.
echo  3. Set environment variables:
for /d %%d in ("%ROOT%\jdk-*") do echo     setx JAVA_HOME "C:\%%~nxd"
echo     setx HADOOP_HOME "%ROOT%\tools\hadoop"
echo     Add %%JAVA_HOME%%\bin to your PATH
echo.
echo  4. Place CSV data files in:
echo     %ROOT%\data\vehicles\
echo.
echo  5. Start the emulator:
echo     python run.py --start
echo.
echo ============================================
pause