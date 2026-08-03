"""
Repairs vehicle CSVs whose "timestamp" column was corrupted by a formatting
bug in fix_timestamps.py: it wrote naive, millisecond-truncated timestamps
("2024-08-04 08:00:00.000") instead of the contract's format
("2024-07-05 08:00:00+00:00"). Every downstream consumer — replay's
validator, gold's pandas parsing — expects the latter uniformly, and the
mismatch crashes gold_service's aggregation loop the moment it hits one.

Reformats the timestamp VALUE's string representation in place; the
underlying date/time information is unaffected. Also repairs the "date"
column to stay consistent wherever it's derivable. Idempotent — rows
already in the correct format are left untouched, so this is safe to run
repeatedly or across a partially-repaired dataset.

Historical vehicles are scanned too (defensively) even though the known bug
only touches active vehicles — see the audit notes for why.

Usage:
    python tools/repair_vehicle_timestamps.py [--yes] [--dry-run]
"""

import argparse
import os
import re
import sys

import pandas as pd

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
VEHICLES_DIR = os.path.join(ROOT, "data", "vehicles")

_GOOD_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}([+-]\d{2}:?\d{2})?$")


def _needs_repair_mask(series: pd.Series) -> pd.Series:
    as_str = series.astype(str)
    return ~as_str.str.match(_GOOD_PATTERN)


def repair_file(path: str, dry_run: bool) -> int:
    df = pd.read_csv(path, low_memory=False)
    if "timestamp" not in df.columns:
        return 0

    bad_mask = _needs_repair_mask(df["timestamp"])
    if not bad_mask.any():
        return 0

    candidates = df.loc[bad_mask, "timestamp"]
    parsed = pd.to_datetime(candidates, format="mixed", errors="coerce", utc=True)

    unparseable = parsed.index[parsed.isna()]
    if len(unparseable) > 0:
        print(f"  WARNING: {path}: {len(unparseable)} row(s) truly unparseable "
              f"even with flexible parsing — left as-is (sample: {candidates.loc[unparseable[0]]!r})")

    fixable_index = parsed.index[~parsed.isna()]
    if len(fixable_index) == 0:
        return 0

    fixed_ts = parsed.loc[fixable_index].dt.strftime("%Y-%m-%d %H:%M:%S+00:00")

    if not dry_run:
        df.loc[fixable_index, "timestamp"] = fixed_ts
        if "date" in df.columns:
            df.loc[fixable_index, "date"] = parsed.loc[fixable_index].dt.strftime("%Y-%m-%d")
        tmp = path + ".tmp"
        df.to_csv(tmp, index=False)
        os.replace(tmp, path)

    return len(fixable_index)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--yes", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not os.path.isdir(VEHICLES_DIR):
        print(f"ERROR: {VEHICLES_DIR} not found")
        sys.exit(1)

    targets = []
    for vid in sorted(os.listdir(VEHICLES_DIR)):
        vdir = os.path.join(VEHICLES_DIR, vid)
        if not os.path.isdir(vdir):
            continue
        for name in sorted(os.listdir(vdir)):
            if name.endswith(".csv"):
                targets.append(os.path.join(vdir, name))

    print(f"Scanning {len(targets)} CSV file(s) under {VEHICLES_DIR}...")
    if not args.yes and not args.dry_run:
        ans = input("Repair malformed timestamps in place? [y/N] ").strip().lower()
        if ans != "y":
            print("Aborted.")
            return

    total_fixed_files = 0
    total_fixed_rows = 0
    for path in targets:
        n = repair_file(path, args.dry_run)
        if n:
            total_fixed_files += 1
            total_fixed_rows += n
            tag = "[DRY] " if args.dry_run else ""
            print(f"  {tag}{os.path.relpath(path, VEHICLES_DIR)}: fixed {n:,} row(s)")

    action = "Would fix" if args.dry_run else "Fixed"
    print(f"\n{action} {total_fixed_rows:,} row(s) across {total_fixed_files} file(s).")
    if total_fixed_files == 0:
        print("Nothing to repair — all timestamps already match the contract format.")


if __name__ == "__main__":
    main()
