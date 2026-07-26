"""
Seed 4 synthetic CLOSED alert rows into data/delta/gold/alerts/ so that
the alerts service always has a non-empty closed_alerts list.

Run once (or any time) from the project root:
    python tools/seed_resolved_alerts.py

Idempotent: re-running overwrites the same seed file; the api.py dedup
(drop_duplicates on alert_id, keep=last by last_updated_ts) ensures
no phantom duplicates accumulate after compaction.
"""

import os
import json
import uuid
import pandas as pd
from datetime import datetime, timedelta, timezone

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, ".."))
ALERTS_ROOT = os.path.join(PROJECT_ROOT, "data", "delta", "gold", "alerts")

SEED_ALERTS = [
    {
        "source_id": "sim003",
        "module": "engine",
        "max_composite_score": 0.87,
        "hours_ago_start": 9.5,
        "hours_ago_end": 7.8,
        "top_10_features": json.dumps({
            "oil_pressure_drop": 0.312,
            "coolant_temp_spike": 0.271,
            "rpm_variance": 0.198,
            "knock_sensor": 0.145,
            "maf_sensor": 0.074,
        }),
    },
    {
        "source_id": "sim010",
        "module": "transmission",
        "max_composite_score": 0.73,
        "hours_ago_start": 6.2,
        "hours_ago_end": 4.9,
        "top_10_features": json.dumps({
            "gear_slip_count": 0.298,
            "fluid_temp": 0.241,
            "shift_delay_ms": 0.187,
            "torque_converter": 0.132,
            "pressure_sensor": 0.142,
        }),
    },
    {
        "source_id": "sim015",
        "module": "battery",
        "max_composite_score": 0.61,
        "hours_ago_start": 4.1,
        "hours_ago_end": 2.7,
        "top_10_features": json.dumps({
            "cell_voltage_delta": 0.334,
            "soc_drop_rate": 0.256,
            "internal_resistance": 0.201,
            "thermal_runaway_risk": 0.209,
        }),
    },
    {
        "source_id": "sim024",
        "module": "body",
        "max_composite_score": 0.54,
        "hours_ago_start": 2.3,
        "hours_ago_end": 1.1,
        "top_10_features": json.dumps({
            "door_seal_pressure": 0.287,
            "chassis_vibration": 0.243,
            "wiper_load": 0.178,
            "hvac_drain": 0.292,
        }),
    },
]


def _make_row(seed: dict, now: datetime) -> dict:
    start_ts = now - timedelta(hours=seed["hours_ago_start"])
    end_ts = now - timedelta(hours=seed["hours_ago_end"])
    peak_ts = start_ts + (end_ts - start_ts) * 0.6

    alert_id = str(uuid.uuid5(
        uuid.NAMESPACE_DNS,
        f"seed:{seed['source_id']}:{seed['module']}",
    ))

    return {
        "alert_id": alert_id,
        "source_id": seed["source_id"],
        "module": seed["module"],
        "status": "CLOSED",
        "alert_start_ts": start_ts.isoformat(),
        "alert_end_ts": end_ts.isoformat(),
        "peak_anomaly_ts": peak_ts.isoformat(),
        "max_composite_score": seed["max_composite_score"],
        "top_10_features": seed["top_10_features"],
        "last_updated_ts": now.isoformat(),
    }


def main():
    os.makedirs(ALERTS_ROOT, exist_ok=True)
    now = datetime.now(timezone.utc)
    rows = [_make_row(s, now) for s in SEED_ALERTS]
    df = pd.DataFrame(rows)
    out_path = os.path.join(ALERTS_ROOT, "_seed_resolved.parquet")
    df.to_parquet(out_path, index=False)
    print(f"Wrote {len(rows)} seeded CLOSED alerts to {out_path}")
    for r in rows:
        print(f"  {r['source_id']} / {r['module']} / score={r['max_composite_score']} / id={r['alert_id'][:8]}…")


if __name__ == "__main__":
    main()
