"""
Creates vehicle data directories for active vehicles that are missing CSV files.

The replay worker injects vehicle_id from source config, so CSV content can
be sampled from an existing vehicle. We copy the first SAMPLE_ROWS rows of
each module CSV from a donor vehicle, renaming to match the target vehicle.

Usage:
    python tools/create_missing_vehicle_data.py [--yes]
"""

import argparse
import os
import sys
import json

SAMPLE_ROWS = 5000

_PROJ = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
_VEHICLES_DIR = os.path.join(_PROJ, "data", "vehicles")
_MANIFEST = os.path.join(_PROJ, "config", "fleet_manifest.json")
_MODULES = ["engine", "battery", "body", "transmission", "tyre"]
_DONOR = "sim001"


def _sample_csv(src: str, dst: str, rows: int) -> None:
    with open(src, "r", encoding="utf-8") as fh:
        header = fh.readline()
        data_lines = []
        for line in fh:
            data_lines.append(line)
            if len(data_lines) >= rows:
                break
    with open(dst, "w", encoding="utf-8", newline="") as fh:
        fh.write(header)
        fh.writelines(data_lines)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--yes", action="store_true")
    args = parser.parse_args()

    with open(_MANIFEST, encoding="utf-8") as fh:
        manifest = json.load(fh)
    active = manifest["active_sims"]

    existing = {
        d for d in os.listdir(_VEHICLES_DIR)
        if os.path.isdir(os.path.join(_VEHICLES_DIR, d))
    }
    missing = sorted(v for v in active if v not in existing)

    if not missing:
        print("All active vehicles already have data directories.")
        return

    donor_dir = os.path.join(_VEHICLES_DIR, _DONOR)
    donor_files = {
        mod: next(
            (f for f in os.listdir(donor_dir) if mod in f and f.endswith(".csv")),
            None,
        )
        for mod in _MODULES
    }
    missing_donors = [m for m, f in donor_files.items() if f is None]
    if missing_donors:
        print(f"ERROR: donor {_DONOR} missing CSV for modules: {missing_donors}")
        sys.exit(1)

    print(f"Missing vehicle directories ({len(missing)}): {missing}")
    print(f"Donor: {_DONOR}  Sample rows per module: {SAMPLE_ROWS}")
    if not args.yes:
        ans = input("Proceed? [y/N] ").strip().lower()
        if ans != "y":
            print("Aborted.")
            return

    for vid in missing:
        vid_dir = os.path.join(_VEHICLES_DIR, vid)
        os.makedirs(vid_dir, exist_ok=True)
        for mod in _MODULES:
            donor_filename = donor_files[mod]
            new_filename = donor_filename.replace(_DONOR, vid)
            src = os.path.join(donor_dir, donor_filename)
            dst = os.path.join(vid_dir, new_filename)
            _sample_csv(src, dst, SAMPLE_ROWS)
            size_kb = os.path.getsize(dst) // 1024
            print(f"  {vid}/{new_filename}  ({size_kb} KB)")

    print(f"\nDone. Created data for {len(missing)} vehicles.")
    print("Restart the replay service to pick up the new sources.")


if __name__ == "__main__":
    main()
