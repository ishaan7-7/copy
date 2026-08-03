"""
Computes Gold vehicle health records from batch Silver Parquet for historical vehicles.

Reads data/batch/silver/{module}/source_id={vid}/silver.parquet, applies the same
weighted aggregation as the live Gold service, writes to data/batch/gold/vehicle_health/.

Run AFTER run_silver_historical.py.

Usage:
    python tools/compute_gold_historical.py [--yes] [--dry-run]
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone

import pandas as pd

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "fleet_simulator"))
from fleet_config import VEHICLES

_PROJ_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
_CFG_PATH = os.path.join(_PROJ_ROOT, "config", "pipeline_config.json")

with open(_CFG_PATH) as _f:
    _cfg = json.load(_f)

MODULES = _cfg["enabled_modules"]
_raw_weights: dict[str, float] = _cfg["module_weights"]
_weight_sum = sum(_raw_weights.values())
NORMALIZED_WEIGHTS = {m: w / _weight_sum for m, w in _raw_weights.items()}
AGGREGATION_WINDOW_SEC = 30

BATCH_SILVER_ROOT = os.path.join(_PROJ_ROOT, "data", "batch", "silver")
BATCH_GOLD_ROOT = os.path.join(_PROJ_ROOT, "data", "batch", "gold", "vehicle_health")

_HISTORICAL_VEHICLES = [v for v in VEHICLES if v["status"] != "active"]


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


def _compute_gold_record(sim_id: str, window_ts: str, module_states: dict[str, dict]) -> dict:
    total_health = 0.0
    contribs = {}
    feature_pool = []

    for mod, weight in NORMALIZED_WEIGHTS.items():
        mod_data = module_states.get(mod, {"health": 100.0, "feats": "{}"})
        h_score = mod_data["health"]
        total_health += h_score * weight
        contribs[f"{mod}_contrib"] = round(h_score, 2)
        try:
            feats = json.loads(mod_data["feats"])
            for f_name, f_val in feats.items():
                feature_pool.append({"feature": f_name, "impact": f_val * weight})
        except Exception:
            pass

    feature_pool.sort(key=lambda x: x["impact"], reverse=True)
    top_5 = {f["feature"]: round(f["impact"], 4) for f in feature_pool[:5]}

    return {
        "source_id": sim_id,
        "gold_window_ts": window_ts,
        "vehicle_health_score": round(min(100.0, total_health), 2),
        **contribs,
        "top_5_features": json.dumps(top_5),
        "gold_write_ts": datetime.now(timezone.utc).isoformat(),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Compute Gold health records for historical vehicles")
    parser.add_argument("--yes", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    print(f"\nBatch Silver root : {BATCH_SILVER_ROOT}")
    print(f"Batch Gold root   : {BATCH_GOLD_ROOT}")
    print(f"Vehicles          : {len(_HISTORICAL_VEHICLES)} non-active\n")

    if args.dry_run:
        print("[DRY RUN — no files will be written]\n")
    elif not args.yes:
        ans = input("Proceed? [y/N] ").strip().lower()
        if ans != "y":
            print("Aborted.")
            sys.exit(0)

    if not args.dry_run:
        os.makedirs(BATCH_GOLD_ROOT, exist_ok=True)

    total_rows = 0
    for v in _HISTORICAL_VEHICLES:
        vid = v["id"]
        df_silver = _read_silver_all(vid)
        if df_silver.empty:
            print(f"  {vid}: no Silver data — skipping")
            continue

        df_silver["timestamp"] = pd.to_datetime(df_silver["timestamp"], errors="coerce")
        df_silver = df_silver.dropna(subset=["timestamp"])
        freq_str = f"{AGGREGATION_WINDOW_SEC}s"
        df_silver["window_ts"] = df_silver["timestamp"].dt.floor(freq_str)

        gold_records = []
        for (window_ts,), group in df_silver.groupby(["window_ts"]):
            module_states: dict[str, dict] = {}
            for _, row in group.iterrows():
                mod = row.get("module_name", "")
                if mod in NORMALIZED_WEIGHTS:
                    module_states[mod] = {
                        "health": float(row.get("health_score", 100.0)),
                        "feats": str(row.get("top_features", "{}")),
                    }
            gold_records.append(_compute_gold_record(vid, str(window_ts), module_states))

        tag = "[DRY] " if args.dry_run else ""
        print(f"  {tag}{vid}: {len(gold_records):,} Gold records")

        if not args.dry_run and gold_records:
            df_gold = pd.DataFrame(gold_records)
            df_gold.to_parquet(
                os.path.join(BATCH_GOLD_ROOT, f"{vid}.parquet"), index=False
            )

        total_rows += len(gold_records)

    action = "Would write" if args.dry_run else "Wrote"
    print(f"\n{action} {total_rows:,} Gold records across {len(_HISTORICAL_VEHICLES)} vehicles.")
    if not args.dry_run:
        print(f"Batch Gold root: {BATCH_GOLD_ROOT}")


if __name__ == "__main__":
    main()
