
import subprocess
import sys
import time
from src import config
import os

def start_cluster():
    print("=========================================")
    print(f"Launching Unified Inference (1 process, {len(config.MODULES)} modules)")
    print("=========================================")

    base_dir = os.path.dirname(os.path.abspath(__file__))
    app_script = os.path.join(base_dir, "app.py")

    p = subprocess.Popen([sys.executable, app_script, "all"])

    print("Inference active. Press Ctrl+C to stop.")

    try:
        p.wait()
    except KeyboardInterrupt:
        print("Stopping Inference...")
        p.terminate()
        print("Stopped.")

if __name__ == "__main__":
    start_cluster()
