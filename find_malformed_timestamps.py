"""
Read-only diagnostic: scans every bronze and silver parquet file for
timestamp values that don't match the contract's expected format
("YYYY-MM-DD HH:MM:SS+ZZ:ZZ", the format every real device-exported CSV
uses), and reports exactly which file/vehicle/value is offending.

Use this whenever gold (or any other timestamp-parsing consumer) crashes
with a pandas "time data ... doesn't match format" error — it pinpoints the
row without needing to guess. Makes no changes to any file.

Usage:
    python tools/find_malformed_timestamps.py
"""

import os
import re
import sys

import pandas as pd

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
MODULES = ["engine", "transmission", "battery", "body", "tyre"]

_GOOD_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}([+-]\d{2}:?\d{2})?$")

ROOTS_TO_SCAN = [
    ("live bronze (hive-partitioned)", os.path.join(ROOT, "data", "delta", "bronze"), True),
    ("live silver (flat)",              os.path.join(ROOT, "data", "delta", "silver"), False),
    ("batch bronze (hive-partitioned)", os.path.join(ROOT, "data", "batch", "bronze"), True),
    ("batch silver (flat)",             os.path.join(ROOT, "data", "batch", "silver"), False),
]


def _bad_values(series: pd.Series) -> pd.Series:
    as_str = series.astype(str)
    mask = ~as_str.str.match(_GOOD_PATTERN)
    return series[mask]


def _schema_columns(path: str) -> set:
    import pyarrow.parquet as pq
    try:
        return set(pq.ParquetFile(path).schema_arrow.names)
    except Exception:
        return set()


def scan_flat(label: str, mod_dir: str) -> int:
    issues = 0
    if not os.path.isdir(mod_dir):
        return issues
    for name in sorted(os.listdir(mod_dir)):
        if not name.endswith(".parquet"):
            continue
        path = os.path.join(mod_dir, name)
        available = _schema_columns(path)
        if "timestamp" not in available:
            continue
        cols = ["timestamp"] + (["source_id"] if "source_id" in available else [])
        try:
            df = pd.read_parquet(path, columns=cols)
        except Exception as exc:
            print(f"  [{label}] {name}: could not read ({exc})")
            continue
        bad = _bad_values(df["timestamp"])
        if not bad.empty:
            issues += 1
            sample = bad.iloc[0]
            sids = sorted(df.loc[bad.index, "source_id"].unique()) if "source_id" in df.columns else ["?"]
            print(f"  [{label}] {name}")
            print(f"      bad_rows={len(bad)}  source_id(s)={sids}  sample_value={sample!r}")
    return issues


def scan_hive(label: str, module_root: str) -> int:
    issues = 0
    if not os.path.isdir(module_root):
        return issues
    for entry in sorted(os.listdir(module_root)):
        if not entry.startswith("source_id="):
            continue
        vid = entry[len("source_id="):]
        part_dir = os.path.join(module_root, entry)
        for name in sorted(os.listdir(part_dir)):
            if not name.endswith(".parquet"):
                continue
            path = os.path.join(part_dir, name)
            try:
                df = pd.read_parquet(path, columns=["timestamp"])
            except Exception as exc:
                print(f"  [{label}] {entry}/{name}: could not read ({exc})")
                continue
            bad = _bad_values(df["timestamp"])
            if not bad.empty:
                issues += 1
                print(f"  [{label}] {entry}/{name}")
                print(f"      bad_rows={len(bad)}  sample_value={bad.iloc[0]!r}")
    return issues


def scan_source_csvs(vehicles_dir: str) -> int:
    """Scans the RAW input CSVs (data/vehicles/{vid}/*.csv) directly — the
    only way to tell whether a malformation was already present in the
    source data itself, versus introduced somewhere in replay/ingest/bronze/
    inference/silver. Reads only the timestamp column for speed."""
    issues = 0
    if not os.path.isdir(vehicles_dir):
        return issues
    for vid in sorted(os.listdir(vehicles_dir)):
        vdir = os.path.join(vehicles_dir, vid)
        if not os.path.isdir(vdir):
            continue
        for name in sorted(os.listdir(vdir)):
            if not name.endswith(".csv"):
                continue
            path = os.path.join(vdir, name)
            try:
                col = pd.read_csv(path, usecols=["timestamp"])["timestamp"]
            except Exception as exc:
                print(f"  [source csv/{vid}] {name}: could not read ({exc})")
                continue
            bad = _bad_values(col)
            if not bad.empty:
                issues += 1
                first_bad_row = int(bad.index[0]) + 2  # +1 header, +1 to 1-index
                print(f"  [source csv/{vid}] {name}")
                print(f"      bad_rows={len(bad)}  first_at_csv_line={first_bad_row}  sample_value={bad.iloc[0]!r}")
    return issues


def main() -> int:
    total_issues = 0

    print("=== Scanning RAW SOURCE CSVs: data/vehicles/ ===")
    print("    (if anything shows up here, the malformation is baked into the")
    print("     input data itself, not introduced by the pipeline)")
    total_issues += scan_source_csvs(os.path.join(ROOT, "data", "vehicles"))

    for label, base, is_hive in ROOTS_TO_SCAN:
        print(f"\n=== Scanning {label}: {base} ===")
        if not os.path.isdir(base):
            print("  (not present)")
            continue
        for mod in MODULES:
            mod_dir = os.path.join(base, mod)
            if is_hive:
                total_issues += scan_hive(f"{label}/{mod}", mod_dir)
            else:
                total_issues += scan_flat(f"{label}/{mod}", mod_dir)

    print()
    if total_issues == 0:
        print("No malformed timestamps found anywhere.")
    else:
        print(f"Found malformed timestamps in {total_issues} location(s) — see above for exact vehicle/file/value.")
        print("If the source CSV is clean but bronze/silver isn't, the malformation is introduced by the")
        print("pipeline (replay/ingest/writer/inference) — tell me which layer first shows it.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
