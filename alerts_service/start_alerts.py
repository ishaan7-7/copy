import subprocess
import sys
import time
import os

def start_alerts():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    app_script = os.path.join(base_dir, "app.py")

    print("=========================================")
    print("Launching Alerts & Faults Aggregator")
    print("=========================================")

    backoff = 5
    while True:
        p = subprocess.Popen([sys.executable, app_script])
        print("Alerts aggregator active. Press Ctrl+C to stop.")
        try:
            p.wait()
        except KeyboardInterrupt:
            print("Stopping Alerts...")
            p.terminate()
            print("Stopped.")
            break
        print(f"Alerts process exited. Restarting in {backoff}s...")
        time.sleep(backoff)
        backoff = min(backoff * 2, 60)

if __name__ == "__main__":
    start_alerts()
