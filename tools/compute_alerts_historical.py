"""
Computes historical Alert records by running the leaky-bucket state machine
over batch Silver Parquet for each non-active vehicle.

Reads data/batch/silver/{module}/source_id={vid}/silver.parquet, processes rows
in timestamp order through the same alert engine logic as the live service,
writes results to data/batch/gold/alerts/.

Run AFTER run_silver_historical.py.

Usage:
    python tools/compute_alerts_historical.py [--yes] [--dry-run]
"""

import argparse
import json
import os
import sys
import uuid
from datetime import datetime, timezone

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "fleet_simulator"))
from fleet_config import VEHICLES

_PROJ_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
_CFG_PATH = os.path.join(_PROJ_ROOT, "config", "pipeline_config.json")

with open(_CFG_PATH) as _f:
    _cfg = json.load(_f)

MODULES = _cfg["enabled_modules"]
MAX_FAULT_SCORE = _cfg["alert_max_fault_score"]
MIN_FAULT_SCORE = _cfg["alert_min_fault_score"]
SCORE_DELTAS = _cfg["alert_score_deltas"]

_MODULE_DELTA_SCALE = {
    "engine": 1.0,
    "transmission": 0.6,
    "battery": 0.5,
    "body": 0.25,
    "tyre": 0.25,
}

BATCH_SILVER_ROOT = os.path.join(_PROJ_ROOT, "data", "batch", "silver")
BATCH_ALERTS_ROOT = os.path.join(_PROJ_ROOT, "data", "batch", "gold", "alerts")

_HISTORICAL_VEHICLES = [v for v in VEHICLES if v["status"] != "active"]

_ALERT_SCHEMA = pa.schema([
    ("alert_id", pa.string()),
    ("source_id", pa.string()),
    ("module", pa.string()),
    ("status", pa.string()),
    ("alert_start_ts", pa.string()),
    ("alert_end_ts", pa.string()),
    ("peak_anomaly_ts", pa.string()),
    ("max_composite_score", pa.float64()),
    ("top_10_features", pa.string()),
    ("last_updated_ts", pa.string()),
])


def _fresh_state() -> dict:
    return {
        "phase": "IDLE",
        "fault_score": 0,
        "alert_id": None,
        "start_ts": None,
        "accumulated_features": {},
        "max_score": 0.0,
        "peak_ts": None,
    }


def _process_row(state: dict, sim_id: str, module: str, row: pd.Series) -> dict | None:
    severity = str(row.get("severity", "NORMAL"))
    comp_score = float(row.get("composite_score", 0.0))
    timestamp = str(row.get("timestamp", ""))

    try:
        feats = json.loads(str(row.get("top_features", "{}")))
    except Exception:
        feats = {}

    base_delta = SCORE_DELTAS.get(severity, 0)
    scale = _MODULE_DELTA_SCALE.get(module, 1.0)
    state["fault_score"] += base_delta * scale
    state["fault_score"] = max(MIN_FAULT_SCORE, min(MAX_FAULT_SCORE, state["fault_score"]))

    if state["fault_score"] > 0:
        for f, val in feats.items():
            state["accumulated_features"][f] = state["accumulated_features"].get(f, 0.0) + val
        if state["phase"] == "IDLE" and state["start_ts"] is None:
            state["start_ts"] = timestamp
        if comp_score > state["max_score"]:
            state["max_score"] = comp_score
            state["peak_ts"] = timestamp

    payload = None

    if state["phase"] == "IDLE":
        if state["fault_score"] >= MAX_FAULT_SCORE:
            state["phase"] = "ACTIVE"
            state["alert_id"] = str(uuid.uuid4())
            payload = _build_payload(sim_id, module, state, "OPEN")
        elif state["fault_score"] == 0:
            state["start_ts"] = None
            state["accumulated_features"] = {}
            state["max_score"] = 0.0
            state["peak_ts"] = None
            state["alert_id"] = None

    elif state["phase"] == "ACTIVE":
        if state["fault_score"] <= MIN_FAULT_SCORE:
            payload = _build_payload(sim_id, module, state, "CLOSED", end_ts=timestamp)
            state["phase"] = "IDLE"
            state["start_ts"] = None
            state["accumulated_features"] = {}
            state["max_score"] = 0.0
            state["peak_ts"] = None
            state["alert_id"] = None
        else:
            payload = _build_payload(sim_id, module, state, "OPEN")

    return payload


def _build_payload(sim_id: str, module: str, state: dict, status: str, end_ts: str | None = None) -> dict:
    sorted_feats = sorted(state["accumulated_features"].items(), key=lambda x: x[1], reverse=True)[:10]
    top_10 = {k: round(v, 4) for k, v in sorted_feats}
    return {
        "alert_id": state["alert_id"],
        "source_id": sim_id,
        "module": module,
        "status": status,
        "alert_start_ts": state["start_ts"],
        "alert_end_ts": end_ts,
        "peak_anomaly_ts": state["peak_ts"],
        "max_composite_score": round(state["max_score"], 4),
        "top_10_features": json.dumps(top_10),
        "last_updated_ts": datetime.now(timezone.utc).isoformat(),
    }


def _read_silver_all(vid: str) -> pd.DataFrame:
    frames = []
    for module in MODULES:
        fp = os.path.join(BATCH_SILVER_ROOT, module, f"source_id={vid}", "silver.parquet")
        if not os.path.exists(fp):
            continue
        try:
            df = pd.read_parquet(fp)
            df["module_name"] = module
            frames.append(df)
        except Exception:
            pass
    return pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()


def main() -> None:
    parser = argparse.ArgumentParser(description="Compute historical alerts from batch Silver data")
    parser.add_argument("--yes", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    print(f"\nBatch Silver root  : {BATCH_SILVER_ROOT}")
    print(f"Batch Alerts root  : {BATCH_ALERTS_ROOT}")
    print(f"Vehicles           : {len(_HISTORICAL_VEHICLES)} non-active\n")

    if args.dry_run:
        print("[DRY RUN — no files will be written]\n")
    elif not args.yes:
        ans = input("Proceed? [y/N] ").strip().lower()
        if ans != "y":
            print("Aborted.")
            sys.exit(0)

    if not args.dry_run:
        os.makedirs(BATCH_ALERTS_ROOT, exist_ok=True)

    total_alerts = 0
    for v in _HISTORICAL_VEHICLES:
        vid = v["id"]
        df_silver = _read_silver_all(vid)
        if df_silver.empty:
            print(f"  {vid}: no Silver data — skipping")
            continue

        df_silver["timestamp"] = pd.to_datetime(df_silver["timestamp"], errors="coerce")
        df_silver = df_silver.dropna(subset=["timestamp"]).sort_values("timestamp")

        alert_updates: dict[str, dict] = {}
        module_states: dict[str, dict] = {}

        for _, row in df_silver.iterrows():
            module = str(row.get("module_name", ""))
            if module not in MODULES:
                continue
            if module not in module_states:
                module_states[module] = _fresh_state()
            payload = _process_row(module_states[module], vid, module, row)
            if payload:
                alert_updates[payload["alert_id"]] = payload

        tag = "[DRY] " if args.dry_run else ""
        print(f"  {tag}{vid}: {len(alert_updates)} alerts")

        if not args.dry_run and alert_updates:
            df_alerts = pd.DataFrame(list(alert_updates.values()))
            pa_table = pa.Table.from_pandas(df_alerts, schema=_ALERT_SCHEMA)
            pq.write_table(pa_table, os.path.join(BATCH_ALERTS_ROOT, f"{vid}.parquet"))

        total_alerts += len(alert_updates)

    action = "Would write" if args.dry_run else "Wrote"
    print(f"\n{action} {total_alerts} total alert records across {len(_HISTORICAL_VEHICLES)} vehicles.")
    if not args.dry_run:
        print(f"Batch Alerts root: {BATCH_ALERTS_ROOT}")


if __name__ == "__main__":
    main()
