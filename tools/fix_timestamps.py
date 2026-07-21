"""
Normalizes active vehicle CSV timestamps so all active vehicles appear to stream
at the same time in sensor charts and the ML pipeline.

Copies the timestamp range from the first active vehicle (donor) to all other
active vehicles via linear interpolation, preserving each file's row count.
Historical vehicles (parked/in_service) are not touched — their cuts 0-2 already
end before the active cuts 3-6 begin.

Must be run AFTER expand_vehicles.py, BEFORE precompute_history.py.

Usage:
    python fix_timestamps.py --root <expanded-data-root> [--yes] [--dry-run]
"""

import argparse
import os
import sys
import glob

import pandas as pd

ACTIVE_IDS: list[str] = [
    "sim001", "sim002", "sim003", "sim004", "sim005",
    "sim007", "sim008", "sim009", "sim010",
    "sim012", "sim013", "sim014", "sim015", "sim016",
    "sim018", "sim019", "sim020", "sim021",
    "sim023", "sim024", "sim025",
    "sim027", "sim028", "sim029", "sim030",
]
DONOR_ID: str = ACTIVE_IDS[0]
MODULES = ["engine", "transmission", "battery", "body", "tyre"]


def _find_csv(root: str, sim_id: str, module: str) -> str | None:
    pattern = os.path.join(root, sim_id, f"*{module}*scenarioA*{sim_id}*.csv")
    matches = glob.glob(pattern)
    if matches:
        return matches[0]
    pattern2 = os.path.join(root, sim_id, f"*{module}*.csv")
    matches2 = glob.glob(pattern2)
    return matches2[0] if matches2 else None


def main() -> None:
    parser = argparse.ArgumentParser(description="Normalize active vehicle CSV timestamps")
    parser.add_argument("--root", required=True, help="Expanded data root directory")
    parser.add_argument("--yes", action="store_true", help="Skip confirmation prompt")
    parser.add_argument("--dry-run", action="store_true", help="Print what would happen without writing")
    args = parser.parse_args()

    root = os.path.abspath(args.root)

    if not os.path.isdir(os.path.join(root, DONOR_ID)):
        print(f"ERROR: donor directory not found: {os.path.join(root, DONOR_ID)}")
        sys.exit(1)

    print(f"Donor vehicle : {DONOR_ID}")
    print(f"Active targets: {len(ACTIVE_IDS) - 1} vehicles\n")

    donor_ranges: dict[str, tuple[pd.Timestamp, pd.Timestamp]] = {}
    for module in MODULES:
        path = _find_csv(root, DONOR_ID, module)
        if path is None:
            print(f"  WARN  {DONOR_ID}/{module}: CSV not found — module skipped")
            continue
        ts_raw = pd.read_csv(path, usecols=["timestamp"])["timestamp"]
        parsed = pd.to_datetime(ts_raw, format="mixed", utc=True)
        t_min, t_max = parsed.min(), parsed.max()
        donor_ranges[module] = (t_min, t_max)
        print(f"  {module:14s}: {t_min.date()} → {t_max.date()}  ({len(ts_raw):,} donor rows)")

    if not donor_ranges:
        print("ERROR: no usable donor modules found")
        sys.exit(1)

    if args.dry_run:
        print("\n[DRY RUN — no files will be written]\n")
    elif not args.yes:
        ans = input(f"\nReplace timestamps for {len(ACTIVE_IDS) - 1} active vehicles? [y/N] ").strip().lower()
        if ans != "y":
            print("Aborted.")
            sys.exit(0)

    total_files = 0
    for target_id in ACTIVE_IDS:
        if target_id == DONOR_ID:
            continue
        for module in MODULES:
            if module not in donor_ranges:
                continue
            target_path = _find_csv(root, target_id, module)
            if target_path is None:
                print(f"  WARN  {target_id}/{module}: CSV not found — skipping")
                continue

            df = pd.read_csv(target_path, low_memory=False)
            if "timestamp" not in df.columns or len(df) == 0:
                continue

            n = len(df)
            t_min, t_max = donor_ranges[module]
            new_ts = pd.date_range(start=t_min, end=t_max, periods=n, tz="UTC")
            new_ts_naive = new_ts.tz_convert(None)
            df["timestamp"] = new_ts_naive.strftime("%Y-%m-%d %H:%M:%S.%f").str[:-3]

            if not args.dry_run:
                df.to_csv(target_path, index=False)

            tag = "[DRY] " if args.dry_run else ""
            print(f"  {tag}{target_id}/{module}: {n:,} rows → [{t_min.date()} → {t_max.date()}]")
            total_files += 1

    action = "Would update" if args.dry_run else "Updated"
    print(f"\n{action} {total_files} CSV files across {len(ACTIVE_IDS) - 1} active vehicles.")
    if not args.dry_run:
        print(f"Root: {root}")


if __name__ == "__main__":
    main()
