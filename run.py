import argparse
import json
import os
import sys
import time
import shutil
import subprocess
import threading
import uuid
import webbrowser
from pathlib import Path

ROOT_DIR         = os.path.dirname(os.path.abspath(__file__))
VENV_PYTHON      = os.path.join(ROOT_DIR, ".venv", "Scripts", "python.exe")

if not os.path.exists(VENV_PYTHON):
    print(f"ERROR: .venv not found at {VENV_PYTHON}")
    print("Run setup.bat first (from the project root) — it creates .venv and")
    print("installs everything run.py needs.")
    sys.exit(1)

if os.path.abspath(sys.executable).lower() != os.path.abspath(VENV_PYTHON).lower():
    sys.exit(subprocess.call([VENV_PYTHON] + sys.argv))

try:
    import psutil
except ImportError:
    print("ERROR: .venv is missing the 'psutil' package (and possibly others).")
    print("This usually means setup.bat's dependency install didn't finish.")
    print(f"Fix: {VENV_PYTHON} -m pip install -r {os.path.join(ROOT_DIR, 'requirements.txt')}")
    print("Then re-run setup.bat to verify everything else is in place too.")
    sys.exit(1)

from common.log_pipe import timestamped_popen, prune_loop

os.environ["PYTHONIOENCODING"] = "utf-8"
os.environ["PYTHONUTF8"] = "1"
os.environ["PYTHONUNBUFFERED"] = "1"
DASH_VENV_PYTHON = os.path.join(ROOT_DIR, "master_dashboard", ".venv_dash", "Scripts", "python.exe")
LOGS_DIR         = os.path.join(ROOT_DIR, "logs")

NODE_DIR  = os.path.join(ROOT_DIR, "tools", "node")
NPM_CACHE = os.path.join(ROOT_DIR, "tools", "npm_cache")

if not os.path.exists(VENV_PYTHON):
    print(f"Warning: {VENV_PYTHON} not found. Using system Python.")
    VENV_PYTHON = sys.executable

if not os.path.exists(DASH_VENV_PYTHON):
    print(f"Warning: {DASH_VENV_PYTHON} not found. Dashboard backend may fail to start.")

KAFKA_BIN_DIR = r"C:\kafka\bin\windows"
KAFKA_LOG_DIR = r"C:\tmp\kafka-logs"
ZK_LOG_DIR    = r"C:\tmp\zookeeper-data"

DTC_HISTORY_FILE   = os.path.join(ROOT_DIR, "data", "dtc_history.json")
REPLAY_PID_FILE    = os.path.join(ROOT_DIR, ".replay.pid")
SESSION_RESET_FILE = os.path.join(ROOT_DIR, "data", "session_reset_token.json")

with open(os.path.join(ROOT_DIR, "config", "pipeline_config.json"), encoding="utf-8") as _fh:
    KAFKA_TOPICS = [f"telemetry.{m}" for m in json.load(_fh)["enabled_modules"]]

os.makedirs(LOGS_DIR, exist_ok=True)


FLEET_SIM_DIR = os.path.join(ROOT_DIR, "tools", "fleet_simulator")

SERVICE_MAP = {
    "api_observer":     ([VENV_PYTHON, r"telemetry_observer\api.py"],                          False, ROOT_DIR),
    "api_alerts":       ([VENV_PYTHON, r"alerts_service\api.py"],                              False, ROOT_DIR),
    "api_gold":         ([VENV_PYTHON, r"gold_service\api.py"],                                False, ROOT_DIR),
    "api_inference":    ([VENV_PYTHON, r"inference_service\api.py"],                           False, ROOT_DIR),
    "api_writer":       ([VENV_PYTHON, r"writer_service\api.py"],                              False, ROOT_DIR),
    "api_dtc":          ([VENV_PYTHON, r"dtc_service\api.py"],                                 False, ROOT_DIR),
    "api_replay_control": ([VENV_PYTHON, r"replay_control_service\api.py"],                    False, ROOT_DIR),

    "engine_alerts":    ([VENV_PYTHON, r"alerts_service\start_alerts.py"],                      False, ROOT_DIR),
    "engine_gold":      ([VENV_PYTHON, r"gold_service\start_gold.py"],                        False, ROOT_DIR),
    "engine_inference": ([VENV_PYTHON, r"inference_service\start_inference_cluster.py"],       False, ROOT_DIR),
    "engine_writer":    ([VENV_PYTHON, r"writer_service\src\start_writer_cluster.py"],         False, ROOT_DIR),
    "fleet_simulator":  ([VENV_PYTHON, "start_fleet_sim.py"],                                  False, FLEET_SIM_DIR),

    "ingest": (f"{VENV_PYTHON} -m uvicorn ingest.app.main:app --port 8000", True, ROOT_DIR),
}

RESET_SCRIPTS = [
    r"tools\reset_alerts_gold.py",
    r"tools\reset_vehicle_health_gold.py",
    r"tools\reset_inference.py",
    r"tools\reset_writer.py",
    r"tools\reset_replay.py",
    r"tools\reset_dashboard_cache.py",
]


API_PORTS = (set(range(8001, 8010)) - {8005})

running_processes = []
HEAD_MODE         = False

PID_REGISTRY_FILE = os.path.join(ROOT_DIR, ".orchestrated_pids.json")
_registry_lock = threading.Lock()


def _load_pid_registry():
    try:
        with open(PID_REGISTRY_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []


def _save_pid_registry(entries):
    try:
        with open(PID_REGISTRY_FILE, "w", encoding="utf-8") as f:
            json.dump(entries, f)
    except Exception:
        pass


def _registry_add(name, pid, detached):
    with _registry_lock:
        entries = _load_pid_registry()
        entries.append({"name": name, "pid": pid, "detached": detached})
        _save_pid_registry(entries)


def _registry_remove(pid):
    with _registry_lock:
        entries = _load_pid_registry()
        entries = [e for e in entries if e.get("pid") != pid]
        _save_pid_registry(entries)


JDK_PATH = r"C:\jdk-11.0.28+6"

def _make_env():
    env = os.environ.copy()
    env["PYTHONPATH"] = ROOT_DIR
    env["JAVA_HOME"] = JDK_PATH
    env["PATH"] = JDK_PATH + r"\bin;" + env.get("PATH", "")
    return env


def run_background_task(cmd_list, name, cwd_path, wait_time=0):
    log_path = os.path.join(LOGS_DIR, f"{name}.log")
    print(f"--- Starting {name} (Logs: {log_path}) ---")
    proc = timestamped_popen(cmd_list, cwd=cwd_path, env=_make_env(), log_path=Path(log_path))
    running_processes.append({"proc": proc, "name": name, "detached": False})
    _registry_add(name, proc.pid, False)
    if wait_time > 0:
        time.sleep(wait_time)


def run_detached_console(cmd_str, name, cwd_path, wait_time=0):
    print(f"--- Starting {name} in a new window ---")
    proc = subprocess.Popen(
        ["cmd.exe", "/k", f"title {name} && {cmd_str}"],
        cwd=cwd_path,
        creationflags=subprocess.CREATE_NEW_CONSOLE,
        env=_make_env(),
    )
    running_processes.append({"proc": proc, "name": name, "detached": True})
    _registry_add(name, proc.pid, True)
    if wait_time > 0:
        time.sleep(wait_time)


def launch_service(cmd, name, cwd, delay=0, always_detach=False):
    """Routes to detached console (head mode / always_detach) or background task (headless)."""
    if always_detach or HEAD_MODE:
        cmd_str = cmd if isinstance(cmd, str) else subprocess.list2cmdline(cmd)
        run_detached_console(cmd_str, name, cwd, delay)
    else:
        cmd_list = cmd if isinstance(cmd, list) else cmd.split()
        run_background_task(cmd_list, name, cwd, delay)


def launch_master_backend():
    cmd      = [DASH_VENV_PYTHON, "-m", "uvicorn", "backend.main_v2:app", "--port", "8005"]
    dash_dir = os.path.join(ROOT_DIR, "master_dashboard")
    if HEAD_MODE:
        run_detached_console(subprocess.list2cmdline(cmd), "Master_Dash_Backend", dash_dir)
    else:
        run_background_task(cmd, "Master_Dash_Backend", dash_dir)


def launch_master_frontend():


    frontend_dir = os.path.join(ROOT_DIR, "master_dashboard", "frontend")

    print("--- Starting Master Dashboard Frontend (React/Vite) ---")
    npm_cmd      = os.path.join(NODE_DIR, "npm.cmd")
    node_exe     = os.path.join(NODE_DIR, "node.exe")
    node_modules = os.path.join(frontend_dir, "node_modules")

    if not os.path.exists(node_exe):
        print(f"   ERROR: Node.js not found at {NODE_DIR}")
        print("   Run setup.bat first to extract Node.js.")
        return

    env = _make_env()
    env["PATH"] = NODE_DIR + os.pathsep + env["PATH"]
    env["npm_config_cache"] = NPM_CACHE

    log_path = os.path.join(LOGS_DIR, "Master_Dash_Frontend.log")

    if not os.path.exists(node_modules):
        print("   node_modules not found — running npm install (this takes ~1 min on first run)...")
        os.makedirs(LOGS_DIR, exist_ok=True)
        with open(log_path, "a", encoding="utf-8") as install_log:
            install_log.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] npm install --legacy-peer-deps\n")
            result = subprocess.run(
                f'"{npm_cmd}" install --legacy-peer-deps',
                shell=True, cwd=frontend_dir,
                stdout=install_log, stderr=subprocess.STDOUT,
                env=env,
            )
        if result.returncode != 0:
            print(f"   ERROR: npm install failed — check {log_path}")
            return
        print("   npm install complete.")

    vite_js  = os.path.join(frontend_dir, "node_modules", "vite", "bin", "vite.js")
    if os.path.exists(vite_js) and os.path.exists(node_exe):
        vite_cmd = f'"{node_exe}" "{vite_js}" --port 5173 --strictPort'
    else:
        vite_cmd = f'"{npm_cmd}" run dev -- --port 5173 --strictPort'

    if HEAD_MODE:
        proc = subprocess.Popen(
            f'cmd.exe /k title Master_Dash_Frontend && {vite_cmd}',
            cwd=frontend_dir,
            creationflags=subprocess.CREATE_NEW_CONSOLE,
            env=env,
        )
        running_processes.append({"proc": proc, "name": "Master_Dash_Frontend", "detached": True})
        _registry_add("Master_Dash_Frontend", proc.pid, True)
    else:
        proc = timestamped_popen(vite_cmd, cwd=frontend_dir, env=env, log_path=Path(log_path), shell=True)
        running_processes.append({"proc": proc, "name": "Master_Dash_Frontend", "detached": False})
        _registry_add("Master_Dash_Frontend", proc.pid, False)

    print("   Waiting for Vite to compile (6s)...")
    time.sleep(6)
    print("   Opening browser at http://localhost:5173")
    webbrowser.open("http://localhost:5173")


def kill_process(p_info):
    """Graceful terminate for background processes; force-kill for detached CMD windows."""
    pid  = p_info["proc"].pid
    name = p_info["name"]

    if p_info.get("detached", False):
        subprocess.run(["taskkill", "/F", "/T", "/PID", str(pid)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print(f"   ✅ Closed window for {name}.")
    else:
        try:
            parent   = psutil.Process(pid)
            children = parent.children(recursive=True)
            for child in children:
                try: child.terminate()
                except: pass
            _, alive = psutil.wait_procs(children, timeout=3)
            for child in alive:
                try: child.kill()
                except: pass
            parent.terminate()
            try:
                parent.wait(timeout=3)
                print(f"   ✅ Closed {name}.")
            except psutil.TimeoutExpired:
                subprocess.run(["taskkill", "/F", "/T", "/PID", str(pid)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                print(f"   ✅ Force-closed {name}.")
        except Exception:
            pass

    _registry_remove(pid)


def hunt_and_kill_port(port, name):
    try:
        connections = psutil.net_connections(kind="inet")
    except Exception:
        return
    for conn in connections:
        if conn.pid is None:
            continue
        if conn.laddr.port == port and conn.status == "LISTEN":
            try:
                p = psutil.Process(conn.pid)
                p.terminate()
                p.wait(timeout=2)
                print(f"   ✅ Force-closed orphaned {name} on port {port}.")
            except psutil.TimeoutExpired:
                try:
                    p.kill()
                    print(f"   ✅ Force-killed orphaned {name} on port {port}.")
                except Exception:
                    pass
            except Exception:
                pass


def hunt_zombie_replay_workers(auto_kill=False):
    print("   🔍 Scanning OS for orphaned zombie replay workers...")
    zombies = []
    for p in psutil.process_iter(["pid", "name", "cmdline"]):
        try:
            cmdline = p.info["cmdline"]
            if cmdline and "python" in p.info["name"].lower():
                cmd_str = " ".join(cmdline).lower()
                if ("replay" in cmd_str or "run_controller" in cmd_str) and "run.py" not in cmd_str:
                    zombies.append(p)
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            pass

    if not zombies:
        print("   ✅ No zombie replay workers found. System is clean.")
        return

    print(f"\n⚠️  WARNING: Detected {len(zombies)} orphaned Replay Worker process(es) still running.")

    if not auto_kill:
        try:
            if input("Do you want to force-kill these zombie workers? (y/n): ").lower() != "y":
                print("   ℹ️ Leaving zombie workers alive.")
                return
        except KeyboardInterrupt:
            print("   ℹ️ Skipping zombie termination due to interrupt.")
            return

    for z in zombies:
        try:
            z.terminate()
            z.wait(timeout=2)
        except psutil.TimeoutExpired:
            z.kill()
        except Exception:
            pass
    print("   ✅ Zombie replay workers eliminated.")


def restart_service(target):
    if target == "master_dashboard":
        for internal_name in ["Master_Dash_Backend", "Master_Dash_Frontend"]:
            for i, p_info in enumerate(running_processes):
                if p_info["name"].lower() == internal_name.lower():
                    print(f"\n[RESTART] Terminating {p_info['name']} (PID: {p_info['proc'].pid})...")
                    kill_process(p_info)
                    running_processes.pop(i)
                    break
        time.sleep(2)
        launch_master_backend()
        time.sleep(4)
        launch_master_frontend()
        print("[RESTART] Master Dashboard is back online.\n")
        return

    if target == "dash_backend":
        internal_name = "Master_Dash_Backend"
    elif target == "dash_frontend":
        internal_name = "Master_Dash_Frontend"
    else:
        internal_name = f"Service_{target}"

    target_idx = -1
    for i, p_info in enumerate(running_processes):
        if p_info["name"].lower() == internal_name.lower():
            target_idx = i
            break

    if target_idx != -1:
        p_info = running_processes[target_idx]
        print(f"\n[RESTART] Terminating existing {p_info['name']} (PID: {p_info['proc'].pid})...")
        kill_process(p_info)
        running_processes.pop(target_idx)
        time.sleep(2)
    else:
        print(f"\n[RESTART] {internal_name} not found in running processes. Starting fresh.")

    if target == "dash_backend":
        launch_master_backend()
        print("[RESTART] Master_Dash_Backend is back online.\n")
    elif target == "dash_frontend":
        launch_master_frontend()
        print("[RESTART] Master_Dash_Frontend is back online.\n")
    else:
        cmd, is_detached, cwd = SERVICE_MAP[target]
        launch_service(cmd, internal_name, cwd, 2, always_detach=is_detached)
        print(f"[RESTART] {internal_name} is back online.\n")


def _stop_replay():
    if os.path.exists(REPLAY_PID_FILE):
        try:
            pid = int(open(REPLAY_PID_FILE).read().strip())
            if psutil.pid_exists(pid):
                parent = psutil.Process(pid)
                children = parent.children(recursive=True)
                for child in children:
                    try: child.terminate()
                    except: pass
                _, alive = psutil.wait_procs(children, timeout=3)
                for child in alive:
                    try: child.kill()
                    except: pass
                parent.terminate()
                try:
                    parent.wait(timeout=3)
                except psutil.TimeoutExpired:
                    parent.kill()
                print("   ✅ Replay service stopped.")
        except Exception:
            pass
        try:
            os.remove(REPLAY_PID_FILE)
        except:
            pass


def _cleanup_orphaned_registry():
    known_pids = {p["proc"].pid for p in running_processes}
    with _registry_lock:
        entries = _load_pid_registry()
        for e in entries:
            pid = e.get("pid")
            if pid in known_pids or not psutil.pid_exists(pid):
                continue
            print(f"   Terminating orphaned {e.get('name')} (PID {pid}) from a previous session...")
            try:
                subprocess.run(["taskkill", "/F", "/T", "/PID", str(pid)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            except Exception:
                pass
        _save_pid_registry([])


def cleanup():
    print("\n" + "=" * 40)
    print("SHUTDOWN SEQUENCE INITIATED")
    print("=" * 40)

    _stop_replay()

    for p_info in reversed(running_processes):
        print(f"Terminating {p_info['name']}...")
        kill_process(p_info)

    print("   ✅ All orchestrated processes terminated.")

    _cleanup_orphaned_registry()

    hunt_and_kill_port(5173, "Node/Vite")
    hunt_and_kill_port(9001, "Replay Metrics")
    hunt_zombie_replay_workers(auto_kill=True)

    print("\nStream offline. All background services and detached windows closed safely.")


def _check_api_liveness():
    try:
        conns = psutil.net_connections(kind="inet")
    except Exception:
        print("   ⚠️  Could not enumerate network connections (consider running as Administrator).")
        return
    listening_ports = {c.laddr.port for c in conns if c.status == "LISTEN"}
    running_api_ports = API_PORTS & listening_ports
    if not running_api_ports:
        print("\n⚠️  WARNING: No backend API services detected on ports 8001-8008.")
        print("   Dashboard will launch but all data feeds will return errors.")
        print("   Consider running first: python run.py --backend")
    else:
        print(f"   ✅ Detected {len(running_api_ports)} API service(s) on ports: {sorted(running_api_ports)}")


def _boot_infra():
    print("\n--- Booting Infrastructure ---")
    run_detached_console(r"tools\kafka\start_zookeeper.bat", "Zookeeper", ROOT_DIR, 20)
    run_detached_console(r"tools\kafka\start_kafka.bat", "Kafka", ROOT_DIR, 30)


def _do_hard_reset(infra_is_running, keep_dashboard=False):
    print("\n--- Stopping Replay Worker (if running) ---")
    _stop_replay()
    hunt_zombie_replay_workers(auto_kill=True)

    if infra_is_running:
        print("Force closing Kafka/ZK to allow log deletion...")
        for port in [2181, 9092]:
            hunt_and_kill_port(port, f"Kafka/ZK Port {port}")
        time.sleep(2)

    print("\n--- Hard Resetting Infrastructure ---")
    reset_ports = set(range(8000, 8010)) - ({8005} if keep_dashboard else set())
    if keep_dashboard:
        print("Clearing in-memory API caches (Ports 8000-8009 excl. 8005 — dashboard untouched)...")
    else:
        print("Clearing in-memory API and frontend caches (Ports 8000-8009, 5173)...")
    for port in sorted(reset_ports):
        hunt_and_kill_port(port, f"API Port {port}")
    if not keep_dashboard:
        hunt_and_kill_port(5173, "Node/Vite")
    time.sleep(2)

    for label, log_dir in [("Kafka", KAFKA_LOG_DIR), ("Zookeeper", ZK_LOG_DIR)]:
        deleted = False
        for attempt in range(5):
            shutil.rmtree(log_dir, ignore_errors=True)
            if not os.path.exists(log_dir):
                deleted = True
                break
            time.sleep(2)
        if not deleted:
            print(f"   ⚠️  WARNING: Could not fully delete {label} log dir: {log_dir}")
            print(f"   Some files may still be locked. Topics will be skipped if they already exist.")

    run_detached_console(r"tools\kafka\start_zookeeper.bat", "Zookeeper", ROOT_DIR, 20)
    run_detached_console(r"tools\kafka\start_kafka.bat", "Kafka", ROOT_DIR, 30)

    print("\n--- Syncing replay_config.json from fleet_manifest.json ---")
    _manifest_path = os.path.join(ROOT_DIR, "config", "fleet_manifest.json")
    _replay_cfg_path = os.path.join(ROOT_DIR, "replay", "config", "replay_config.json")
    with open(_manifest_path, encoding="utf-8") as _fh:
        _fleet_manifest = json.load(_fh)
    with open(_replay_cfg_path, encoding="utf-8") as _fh:
        _replay_cfg = json.load(_fh)
    _replay_cfg["enabled_sims"] = _fleet_manifest["active_sims"]
    with open(_replay_cfg_path, "w", encoding="utf-8") as _fh:
        json.dump(_replay_cfg, _fh, indent=2)
    print(f"   ✅ enabled_sims → {len(_fleet_manifest['active_sims'])} active sims")

    print("\n--- Recreating Kafka Topics ---")
    for topic in KAFKA_TOPICS:
        subprocess.run(
            fr"{KAFKA_BIN_DIR}\kafka-topics.bat --create --if-not-exists --topic {topic} --bootstrap-server localhost:9092 --partitions 6 --replication-factor 1",
            shell=True,
            env=_make_env(),
        )

    print("\n--- Resetting Spark/Stream Files ---")
    for script in RESET_SCRIPTS:
        subprocess.run([VENV_PYTHON, os.path.join(ROOT_DIR, script)], input="yes\n", text=True)

    print("\n--- Clearing DTC History ---")
    if os.path.exists(DTC_HISTORY_FILE):
        with open(DTC_HISTORY_FILE, "w", encoding="utf-8") as fh:
            json.dump([], fh)
        print("   ✅ DTC history cleared.")
    if os.path.exists(REPLAY_PID_FILE):
        os.remove(REPLAY_PID_FILE)

    print("\n--- Clearing Ingest DLQ ---")
    ingest_dlq_dir = os.path.join(ROOT_DIR, "ingest", "dlq")
    if os.path.exists(ingest_dlq_dir):
        for item in os.listdir(ingest_dlq_dir):
            if item == ".gitignore":
                continue
            item_path = os.path.join(ingest_dlq_dir, item)
            try:
                if os.path.isdir(item_path):
                    shutil.rmtree(item_path)
                else:
                    os.remove(item_path)
            except Exception as e:
                print(f"   ⚠️ Could not delete {item}: {e}")
        print("   ✅ Ingest DLQ cleared.")
    else:
        print("   ✅ Ingest DLQ already empty.")


    os.makedirs(os.path.dirname(SESSION_RESET_FILE), exist_ok=True)
    with open(SESSION_RESET_FILE, "w", encoding="utf-8") as fh:
        json.dump({"reset_token": str(uuid.uuid4())}, fh)
    print("   ✅ Chat session reset token bumped — Fleet Assistant chat history will clear on next load.")


def _start_all_services():
    for service_key, (cmd, is_detached, cwd) in SERVICE_MAP.items():
        service_name = f"Service_{service_key}"

        delay = 5 if (is_detached or service_key.startswith("engine_")) else 1
        launch_service(cmd, service_name, cwd, delay, always_detach=is_detached)


def _interactive_loop():
    restartable_list = list(SERVICE_MAP.keys()) + ["dash_backend", "dash_frontend", "master_dashboard"]

    print("\nINTERACTIVE SERVICE MANAGER")
    print("Available services to restart:")
    for key in restartable_list:
        print(f"  - {key}")
    print("\nType a service name and press Enter to restart it.")
    print("Press Ctrl+C at any time to safely shut down the entire emulator.")

    while True:
        target = input("\nemulator> ").strip().lower()
        if target in restartable_list:
            restart_service(target)
        elif target:
            print(f"Unknown service '{target}'. Please choose from the list above.")


def main(args):
    interactive = not any([args.reset, args.start, args.backend, args.dashboard])

    threading.Thread(target=prune_loop, args=(Path(LOGS_DIR),), kwargs={"max_age_hours": 24.0, "interval_seconds": 3600.0}, daemon=True).start()

    if not args.skip_preflight:
        print("\n--- Preflight Validation ---")
        preflight_rc = subprocess.call([VENV_PYTHON, os.path.join(ROOT_DIR, "tools", "preflight_check.py")])
        if preflight_rc != 0:
            print("\nPreflight failed. Fix the issues above, or rerun with --skip-preflight to bypass.")
            return


    if args.dashboard:
        print("\n--- Dashboard Mode ---")
        _check_api_liveness()
        launch_master_backend()
        time.sleep(4)
        launch_master_frontend()
        _interactive_loop()
        return


    print("\nChecking Infrastructure State...")
    try:
        _infra_conns = psutil.net_connections(kind="inet")
        listening_ports = {c.laddr.port for c in _infra_conns if c.status == "LISTEN"}
    except Exception:
        print("   ⚠️  Could not enumerate network connections (consider running as Administrator).")
        listening_ports = set()
    infra_is_running = bool({2181, 9092} & listening_ports)

    if interactive and infra_is_running:
        if input("Zookeeper/Kafka are already running. Kill them? (y/n): ").lower() == "y":
            for port in [2181, 9092]:
                hunt_and_kill_port(port, f"Kafka/ZK Port {port}")
            infra_is_running = False
            time.sleep(2)


    if args.reset and infra_is_running:
        for port in [2181, 9092]:
            hunt_and_kill_port(port, f"Kafka/ZK Port {port}")
        infra_is_running = False
        time.sleep(2)


    do_reset = args.reset or (interactive and input("\nReset stream files and topics (Hard Reset)? (y/n): ").lower() == "y")
    if do_reset:
        _do_hard_reset(infra_is_running, keep_dashboard=args.keep_dashboard)
        if args.reset and args.keep_dashboard:
            print("\n--- Relaunching backend services (dashboard was not touched) ---")
            _start_all_services()
            print("Hard reset complete — backend services are relaunching.")
            print("Data will show zeroes for ~10-15s while they initialize.")
            os._exit(0)
        if args.reset and not args.start:
            print("\nReset complete. Kafka and Zookeeper are running. Exiting.")
            return
    else:
        if not infra_is_running:
            _boot_infra()
        else:
            print("\n--- Resuming Existing Infrastructure ---")


    start_dashboard = args.start or (not args.backend and (interactive and input("\nStart Master Dashboard? (y/n): ").lower() == "y"))
    if start_dashboard:
        launch_master_backend()
        time.sleep(4)
        launch_master_frontend()


    do_start_services = args.start or args.backend or (interactive and input("\nStart Backend Services? (y/n): ").lower() == "y")
    if do_start_services:
        _start_all_services()

    print("\n" + "=" * 50)
    print("SYSTEM READY.")
    print("Action: Start replay using the Notebook.")
    print()
    print("NOTE: Services initialize within ~10s of launch.")
    print("SystemOps may show zeroes until the first data flows — this is normal.")
    print("Start replay AFTER writer status shows RUNNING on SystemOps.")
    print("=" * 50)

    _interactive_loop()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Streaming Emulator Launcher")
    parser.add_argument("--reset",     action="store_true", help="Hard reset stream files and topics, then exit")
    parser.add_argument("--start",     action="store_true", help="Start all services and dashboard without prompts")
    parser.add_argument("--backend",   action="store_true", help="Start backend services only, no dashboard")
    parser.add_argument("--dashboard", action="store_true", help="Start master dashboard only (warns if APIs are not running)")
    parser.add_argument("--head",      action="store_true", help="Launch all services in visible terminal windows instead of log files")
    parser.add_argument("--skip-preflight", action="store_true", dest="skip_preflight", help="Skip config/data preflight validation")
    parser.add_argument("--keep-dashboard", action="store_true", dest="keep_dashboard",
                         help="With --reset: hard-reset every backend service except the dashboard "
                              "(8005) and frontend (5173), then relaunch them and exit — for triggering "
                              "a hard reset from a live dashboard session without killing it.")
    args = parser.parse_args()

    HEAD_MODE = args.head

    try:
        main(args)
    except KeyboardInterrupt:
        print("\n\n[Ctrl+C Detected: Interrupting sequence safely...]")
    except Exception as e:
        print(f"\n[Unexpected Error: {e}]")
    finally:
        try:
            cleanup()
        except KeyboardInterrupt:
            pass
