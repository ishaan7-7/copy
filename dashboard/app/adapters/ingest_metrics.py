from typing import Dict, Any
import requests


def fetch_ingest_metrics(metrics_url: str) -> Dict[str, Any]:
    snapshot: Dict[str, Any] = {}

    try:
        resp = requests.get(metrics_url, timeout=2)
        resp.raise_for_status()
    except Exception:
        return snapshot

    for line in resp.text.splitlines():
        if not line or line.startswith("#"):
            continue

        try:
            name, value = line.split(" ", 1)
            snapshot[name] = float(value)
        except Exception:
            continue

    return snapshot
