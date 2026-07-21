"""
Ingests expanded historical vehicle CSVs into Bronze Delta-compatible Parquet.

Writes hive-partitioned output to data/delta/bronze/{module}/source_id={vid}/
so the existing BronzeReader and automotive_api sensor-history endpoint find
historical vehicle data through the same code paths as active vehicles.

Run AFTER fix_timestamps.py (expanded CSV data must be ready).
Run BEFORE run_silver_historical.py.

Usage:
    python tools/ingest_historical.py --data-root <expanded-root> [--yes] [--dry-run]
"""

import argparse
import glob
import hashlib
import os
import sys
from datetime import datetime, timezone

import pandas as pd

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "fleet_simulator"))
from fleet_config import VEHICLES

MODULES = ["engine", "transmission", "battery", "body", "tyre"]

_PROJ_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
BRONZE_ROOT = os.path.join(_PROJ_ROOT, "data", "delta", "bronze")

_HISTORICAL_VEHICLES = [v for v in VEHICLES if v["status"] != "active"]


def _find_csv(data_root: str, vid: str, module: str) -> str | None:
    pattern = os.path.join(data_root, vid, f"*{module}*scenarioA*{vid}*.csv")
    matches = glob.glob(pattern)
    if matches:
        return matches[0]
    pattern2 = os.path.join(data_root, vid, f"*{module}*.csv")
    matches2 = glob.glob(pattern2)
    return matches2[0] if matches2 else None


def _ingest_one(data_root: str, vid: str, module: str, now_ts: str, dry_run: bool) -> int:
    csv_path = _find_csv(data_root, vid, module)
    if csv_path is None:
        print(f"    WARN {vid}/{module}: CSV not found — skipping")
        return 0

    df = pd.read_csv(csv_path, low_memory=False)
    if df.empty:
        return 0

    df["source_id"] = vid
    df["ingest_ts"] = now_ts
    df["writer_ts"] = now_ts

    def _row_hash(row):
        key = f"{vid}|{row.get('timestamp', '')}|{module}|{row.name}"
        return hashlib.md5(key.encode()).hexdigest()

    df["row_hash"] = [hashlib.md5(f"{vid}|{ts}|{module}|{i}".encode()).hexdigest()
                      for i, ts in enumerate(df.get("timestamp", range(len(df))))]

    out_dir = os.path.join(BRONZE_ROOT, module, f"source_id={vid}")
    out_path = os.path.join(out_dir, "batch.parquet")

    if not dry_run:
        os.makedirs(out_dir, exist_ok=True)
        df.to_parquet(out_path, index=False)

    return len(df)


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest historical vehicle CSVs into Bronze Parquet")
    parser.add_argument("--data-root", required=True, help="Expanded data root with per-vehicle subdirs")
    parser.add_argument("--yes", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    data_root = os.path.abspath(args.data_root)
    now_ts = datetime.now(timezone.utc).isoformat()

    print(f"\nData root    : {data_root}")
    print(f"Bronze root  : {BRONZE_ROOT}")
    print(f"Vehicles     : {len(_HISTORICAL_VEHICLES)} non-active")
    print(f"Ingest ts    : {now_ts}\n")

    if args.dry_run:
        print("[DRY RUN — no files will be written]\n")
    elif not args.yes:
        ans = input("Proceed? [y/N] ").strip().lower()
        if ans != "y":
            print("Aborted.")
            sys.exit(0)

    total_rows = 0
    for v in _HISTORICAL_VEHICLES:
        vid = v["id"]
        print(f"  {vid}  ({v['status']})")
        for module in MODULES:
            n = _ingest_one(data_root, vid, module, now_ts, args.dry_run)
            tag = "[DRY] " if args.dry_run else ""
            if n > 0:
                print(f"    {tag}{module:14s}: {n:,} rows")
            total_rows += n

    action = "Would write" if args.dry_run else "Wrote"
    print(f"\n{action} {total_rows:,} total rows across {len(_HISTORICAL_VEHICLES)} vehicles.")
    if not args.dry_run:
        print(f"Bronze root: {BRONZE_ROOT}")


if __name__ == "__main__":
    main()
