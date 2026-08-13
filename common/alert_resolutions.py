"""
Shared "manually resolved" alert overlay, read by every alert-serving
backend (alerts_service/api.py on its own process, automotive_api.py mounted
in-process in the gateway). A resolve action doesn't rewrite the upstream
gold/alerts parquet (that's the live pipeline's own upsert stream) — it just
records the alert_id here, and each reader flips that row's status to
CLOSED before doing its own open/closed split, so every surface (Fleet
Health, Cockpit View, Vehicle Deep Dive) stays consistent for free.
"""

import json
import os
import time
from threading import Lock

_PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
RESOLVED_ALERTS_FILE = os.path.join(_PROJECT_ROOT, "data", "resolved_alerts.json")

_lock = Lock()


def _read_all() -> dict:
    try:
        if os.path.exists(RESOLVED_ALERTS_FILE):
            with open(RESOLVED_ALERTS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
    except Exception:
        pass
    return {}


def load_resolved_ids() -> set:
    return set(_read_all().keys())


def resolve_alert_id(alert_id: str, source_id: str = "", module: str = "") -> dict:
    with _lock:
        data = _read_all()
        entry = {
            "source_id": source_id,
            "module": module,
            "resolved_ts": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()) + "Z",
        }
        data[alert_id] = entry
        os.makedirs(os.path.dirname(RESOLVED_ALERTS_FILE), exist_ok=True)
        with open(RESOLVED_ALERTS_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        return entry
