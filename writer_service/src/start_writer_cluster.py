import subprocess
import time
import sys
import os

import json as _json, pathlib as _pl
MODULES = _json.loads((_pl.Path(__file__).resolve().parents[2] / "config" / "pipeline_config.json").read_text())["enabled_modules"]
PROCESSES = []

def start_writers():
    python_exe = sys.executable
    script_path = "writer_service/src/stream_processor.py"

    if not os.path.exists(script_path):
        print(f"Error: Not found: {script_path}")
        return

    print(f"Launching Unified Writer (1 JVM, {len(MODULES)} streams, local[4])...")
    p = subprocess.Popen([python_exe, script_path, "all"])
    PROCESSES.append(p)

    print("Cluster Active. Press Ctrl+C to stop.")

    backoff = 5
    try:
        while True:
            time.sleep(1)
            if p.poll() is not None:
                print(f"Writer process exited. Restarting in {backoff}s...")
                time.sleep(backoff)
                backoff = min(backoff * 2, 60)
                p = subprocess.Popen([python_exe, script_path, "all"])
                PROCESSES.append(p)
                print("Writer process restarted.")
    except KeyboardInterrupt:
        print("Stopping...")
        p.terminate()

if __name__ == "__main__":
    start_writers()
