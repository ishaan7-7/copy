# File: C:\streaming_emulator\writer_service\verify_step4.py
import time
import json
import os
import glob
from pathlib import Path

# Look for ALL metrics files
METRICS_DIR = Path("C:/streaming_emulator/writer_service/state")
METRICS_PATTERN = "writer_metrics_*.json"

def monitor_metrics():
    print(f"🕵️  Watching for metrics in: {METRICS_DIR}")
    
    # Wait for at least one file
    while not list(METRICS_DIR.glob(METRICS_PATTERN)):
        print("⏳ Waiting for writer_metrics_*.json...", end="\r")
        time.sleep(1)
    
    print("\n✅ Metrics detected! Monitoring (Ctrl+C to stop)...")
    print("-" * 95)
    print(f"{'MODULE':<12} | {'BATCH':<8} | {'INPUT':<8} | {'TOTAL ROWS':<12} | {'STATUS':<15}")
    print("-" * 95)

    try:
        while True:
            files = list(METRICS_DIR.glob(METRICS_PATTERN))
            # Sort to keep display order consistent
            files.sort()
            
            # Clear screen (optional, creates flicker but clean)
            # or just print new block
            
            for file_path in files:
                try:
                    with open(file_path, 'r') as f:
                        data = json.load(f)
                    
                    streams = data.get("streams", {})
                    for name, s in streams.items():
                        batch = s.get('batch_id', '-')
                        input_rows = s.get('num_input_rows', '-')
                        total_rows = s.get('total_rows_processed', 0)
                        status = s.get('status', 'UNKNOWN')
                        
                        print(f"{name:<12} | {str(batch):<8} | {str(input_rows):<8} | {str(total_rows):<12} | {status:<15}")
                except:
                    pass
            
            print("-" * 95)
            time.sleep(2) # Update every 2 seconds
            
    except KeyboardInterrupt:
        print("\nStopped.")

if __name__ == "__main__":
    monitor_metrics()