"""
Runs offline LSTM+GMM inference on historical vehicle Bronze Parquet data,
writing Silver Parquet to data/batch/silver/{module}/source_id={vid}/.

Uses the same MLEngine class as the live inference service so Silver schema
is identical. Automotive API reads from data/batch/silver/ for historical vehicles.

Run AFTER ingest_historical.py.
Run BEFORE compute_gold_historical.py and compute_alerts_historical.py.

Usage:
    python tools/run_silver_historical.py [--yes] [--dry-run]
"""

import argparse
import os
import sys
from datetime import datetime, timezone

import pandas as pd

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "fleet_simulator"))
from fleet_config import VEHICLES

_PROJ_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
_INFER_DIR = os.path.join(_PROJ_ROOT, "inference_service")
sys.path.insert(0, _INFER_DIR)

from src.ml_engine import MLEngine  # noqa: E402
from src import config as _inf_cfg   # noqa: E402
import src.ml_engine as _ml_mod      # noqa: E402

sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))
from expand_vehicles import MANIFEST as _MANIFEST  # noqa: E402

_source_biases = dict(_ml_mod._VEHICLE_HEALTH_BIAS)
for _target_vid, (_source_vid, _cut_idx) in _MANIFEST.items():
    if _target_vid not in _source_biases:
        _ml_mod._VEHICLE_HEALTH_BIAS[_target_vid] = _source_biases.get(_source_vid, 1.0)

MODULES = ["engine", "transmission", "battery", "body", "tyre"]


class _BatchStateManager:
    def log_alert(self, sim_id: str, level: str, message: str) -> None:
        print(f"    [{level}] {sim_id}: {message}")

    def get_ml_state(self, sim_id: str) -> dict:
        return {"ema_error": 0.0, "persistence_counter": 0, "last_window_data": None}

    def update_ml_state(self, sim_id: str, ema_error: float, persistence_counter: int, last_window_data) -> None:
        pass
BRONZE_ROOT = _inf_cfg.BRONZE_DIR
BATCH_SILVER_ROOT = os.path.join(_PROJ_ROOT, "data", "batch", "silver")

_HISTORICAL_VEHICLES = [v for v in VEHICLES if v["status"] != "active"]


def _read_bronze(vid: str, module: str) -> pd.DataFrame:
    part_dir = os.path.join(BRONZE_ROOT, module, f"source_id={vid}")
    if not os.path.exists(part_dir):
        return pd.DataFrame()
    files = [
        os.path.join(part_dir, f)
        for f in os.listdir(part_dir)
        if f.endswith(".parquet")
    ]
    if not files:
        return pd.DataFrame()
    dfs = []
    for fp in files:
        try:
            dfs.append(pd.read_parquet(fp))
        except Exception:
            pass
    return pd.concat(dfs, ignore_index=True) if dfs else pd.DataFrame()


def main() -> None:
    parser = argparse.ArgumentParser(description="Run Silver inference for historical vehicles")
    parser.add_argument("--yes", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    print(f"\nBronze root        : {BRONZE_ROOT}")
    print(f"Batch Silver root  : {BATCH_SILVER_ROOT}")
    print(f"Vehicles           : {len(_HISTORICAL_VEHICLES)} non-active\n")

    if args.dry_run:
        print("[DRY RUN — no files will be written]\n")
    elif not args.yes:
        ans = input("Proceed? [y/N] ").strip().lower()
        if ans != "y":
            print("Aborted.")
            sys.exit(0)

    engines: dict[str, MLEngine] = {}
    for module in MODULES:
        try:
            engines[module] = MLEngine(_BatchStateManager(), module)
            print(f"  Loaded MLEngine: {module}")
        except Exception as e:
            print(f"  WARN: MLEngine({module}) failed: {e} — module skipped")

    total_rows = 0
    for v in _HISTORICAL_VEHICLES:
        vid = v["id"]
        print(f"\n  {vid}  ({v['status']})")
        for module in MODULES:
            if module not in engines:
                continue
            df_bronze = _read_bronze(vid, module)
            if df_bronze.empty:
                print(f"    {module:14s}: no Bronze data — skipping")
                continue

            try:
                silver_rows = engines[module].process_batch(df_bronze, vid)
            except Exception as e:
                print(f"    {module:14s}: inference failed: {e}")
                continue

            if not silver_rows:
                print(f"    {module:14s}: 0 Silver rows produced")
                continue

            df_silver = pd.DataFrame(silver_rows) if isinstance(silver_rows, list) else silver_rows

            tag = "[DRY] " if args.dry_run else ""
            print(f"    {tag}{module:14s}: {len(df_silver):,} Silver rows")

            if not args.dry_run:
                out_dir = os.path.join(BATCH_SILVER_ROOT, module, f"source_id={vid}")
                os.makedirs(out_dir, exist_ok=True)
                df_silver.to_parquet(os.path.join(out_dir, "silver.parquet"), index=False)

            total_rows += len(df_silver)

    action = "Would write" if args.dry_run else "Wrote"
    print(f"\n{action} {total_rows:,} Silver rows across {len(_HISTORICAL_VEHICLES)} vehicles.")
    if not args.dry_run:
        print(f"Batch Silver root: {BATCH_SILVER_ROOT}")


if __name__ == "__main__":
    main()
