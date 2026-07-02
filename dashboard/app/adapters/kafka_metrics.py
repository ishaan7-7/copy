from typing import Dict, Any
import requests
import re

# Updated Regex:
# 1. Matches "kafka_rows_per_vehicle" OR "kafka_rows_per_vehicle_total"
# 2. Captures the vehicle_id inside the braces
# 3. Captures the numeric value at the end
VEHICLE_ROW_PATTERN = re.compile(r'kafka_rows_per_vehicle(?:_total)?\{vehicle_id="([^"]+)"\}\s+(\d+\.?\d*)')

def fetch_kafka_metrics(metrics_url: str) -> Dict[str, Any]:
    # Initialize with an empty vehicles dict so the key always exists
    snapshot: Dict[str, Any] = {"vehicles": {}}

    try:
        resp = requests.get(metrics_url, timeout=2)
        resp.raise_for_status()
    except Exception:
        return snapshot

    for line in resp.text.splitlines():
        if not line or line.startswith("#"):
            continue

        # 1. Check for Vehicle specific metrics first
        v_match = VEHICLE_ROW_PATTERN.search(line)
        if v_match:
            v_id, v_val = v_match.groups()
            snapshot["vehicles"][v_id] = float(v_val)
            continue

        # 2. Fallback to standard "Key Value" parsing for everything else
        try:
            name, value = line.split(" ", 1)
            snapshot[name] = float(value)
        except Exception:
            continue

    return snapshot
