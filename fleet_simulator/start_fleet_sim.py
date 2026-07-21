import subprocess
import sys
import time
import os

def start_fleet_sim():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    server_script = os.path.join(base_dir, "fleet_sim_server.py")

    print("=========================================")
    print("Launching Fleet Simulator (port 8009)")
    print("=========================================")

    backoff = 5
    while True:
        p = subprocess.Popen([sys.executable, server_script], cwd=base_dir)
        print("Fleet simulator active. Press Ctrl+C to stop.")
        try:
            p.wait()
        except KeyboardInterrupt:
            print("Stopping Fleet Simulator...")
            p.terminate()
            print("Stopped.")
            break
        print(f"Fleet simulator exited. Restarting in {backoff}s...")
        time.sleep(backoff)
        backoff = min(backoff * 2, 60)

if __name__ == "__main__":
    start_fleet_sim()
