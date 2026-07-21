"""
Expands 7 source vehicle datasets into 40 target vehicle datasets by date-slicing.

The 34-day tyre window (binding constraint) is divided into N_CUTS=7 equal segments
of ~4.86 days each. Cuts are designated by role:
  - Cuts 0-2 (days 0-14.6)  : historical vehicles only (parked / in_service)
  - Cuts 3-6 (days 14.6-34) : active vehicles only (streaming replay)

This guarantees a hard timestamp boundary: every historical vehicle's data ends
before every active vehicle's data begins, regardless of source.

Usage:
    python expand_vehicles.py --source-root <path> --out-root <path> [--yes] [--dry-run]
"""

import argparse
import os
import sys
import glob

import pandas as pd

MODULES = ["engine", "transmission", "battery", "body", "tyre"]

N_CUTS = 7

MANIFEST: dict[str, tuple[str, int]] = {
    "sim001": ("sim007", 6),
    "sim002": ("sim007", 5),
    "sim003": ("sim007", 4),
    "sim004": ("sim007", 3),
    "sim005": ("sim001", 6),
    "sim006": ("sim002", 2),
    "sim007": ("sim001", 5),
    "sim008": ("sim001", 4),
    "sim009": ("sim001", 3),
    "sim010": ("sim009", 6),
    "sim011": ("sim008", 2),
    "sim012": ("sim009", 5),
    "sim013": ("sim009", 4),
    "sim014": ("sim009", 3),
    "sim015": ("sim002", 6),
    "sim016": ("sim002", 5),
    "sim017": ("sim002", 1),
    "sim018": ("sim002", 4),
    "sim019": ("sim002", 3),
    "sim020": ("sim010", 6),
    "sim021": ("sim010", 5),
    "sim022": ("sim008", 1),
    "sim023": ("sim010", 4),
    "sim024": ("sim010", 3),
    "sim025": ("sim003", 6),
    "sim026": ("sim008", 0),
    "sim027": ("sim003", 5),
    "sim028": ("sim003", 4),
    "sim029": ("sim003", 3),
    "sim030": ("sim008", 6),
    "sim031": ("sim003", 2),
    "sim032": ("sim007", 2),
    "sim033": ("sim010", 2),
    "sim034": ("sim003", 1),
    "sim035": ("sim009", 2),
    "sim036": ("sim002", 0),
    "sim037": ("sim003", 0),
    "sim038": ("sim010", 1),
    "sim039": ("sim001", 2),
    "sim040": ("sim010", 0),
}

_HISTORICAL_TARGET_IDS: frozenset[str] = frozenset({
    "sim006", "sim011", "sim017", "sim022", "sim026",
    "sim031", "sim032", "sim033", "sim034", "sim035",
    "sim036", "sim037", "sim038", "sim039", "sim040",
})

_SOURCE_IDS = sorted(set(src for src, _ in MANIFEST.values()))

_ACTIVE_CUT_MIN = 3


def _validate_manifest() -> None:
    pairs = list(MANIFEST.values())
    seen: set = set()
    for pair in pairs:
        assert pair not in seen, f"Duplicate (source, cut): {pair}"
        seen.add(pair)

    for target, (src, cut) in MANIFEST.items():
        is_historical = cut < _ACTIVE_CUT_MIN
        is_non_active = target in _HISTORICAL_TARGET_IDS
        assert is_historical == is_non_active, (
            f"{target} ← ({src}, cut{cut}): "
            f"cut {'<' if is_historical else '>='}{_ACTIVE_CUT_MIN} "
            f"but vehicle is {'historical' if is_non_active else 'active'}"
        )


def _find_csv(root: str, sim_id: str, module: str) -> str | None:
    pattern = os.path.join(root, sim_id, f"*{module}*scenarioA*{sim_id}*.csv")
    matches = glob.glob(pattern)
    if matches:
        return matches[0]
    pattern2 = os.path.join(root, sim_id, f"*{module}*.csv")
    matches2 = glob.glob(pattern2)
    return matches2[0] if matches2 else None


def _compute_cut_boundaries(
    source_root: str, source_id: str
) -> list[tuple[pd.Timestamp, pd.Timestamp]]:
    tyre_path = _find_csv(source_root, source_id, "tyre")
    if tyre_path is None:
        raise FileNotFoundError(
            f"Tyre CSV not found for {source_id} in {source_root}"
        )

    ts_series = pd.read_csv(tyre_path, usecols=["timestamp"])["timestamp"]
    parsed = pd.to_datetime(ts_series, format="mixed", utc=True)
    t_min = parsed.min()
    t_max = parsed.max()

    span = t_max - t_min
    step = span / N_CUTS
    boundaries = []
    for k in range(N_CUTS):
        cut_start = t_min + k * step
        cut_end = t_min + (k + 1) * step
        boundaries.append((cut_start, cut_end))

    return boundaries


def _source_id_col(df: pd.DataFrame) -> str | None:
    for col in ("source_id", "sim_id", "vehicle_id"):
        if col in df.columns:
            return col
    return None


def _process_one(
    source_root: str,
    out_root: str,
    target_id: str,
    source_id: str,
    cut_index: int,
    boundaries: list[tuple[pd.Timestamp, pd.Timestamp]],
    dry_run: bool,
) -> dict[str, int]:
    cut_start, cut_end = boundaries[cut_index]
    out_dir = os.path.join(out_root, target_id)
    if not dry_run:
        os.makedirs(out_dir, exist_ok=True)

    row_counts: dict[str, int] = {}

    for module in MODULES:
        src_path = _find_csv(source_root, source_id, module)
        if src_path is None:
            print(f"  WARN  {source_id}/{module}: CSV not found — skipping")
            continue

        df = pd.read_csv(src_path, low_memory=False)

        if "timestamp" not in df.columns:
            print(f"  WARN  {source_id}/{module}: no 'timestamp' column — skipping")
            continue

        df["_ts"] = pd.to_datetime(df["timestamp"], format="mixed", utc=True)

        if cut_index < N_CUTS - 1:
            mask = (df["_ts"] >= cut_start) & (df["_ts"] < cut_end)
        else:
            mask = df["_ts"] >= cut_start

        chunk = df.loc[mask].copy()
        chunk.drop(columns=["_ts"], inplace=True)

        id_col = _source_id_col(chunk)
        if id_col is not None:
            chunk[id_col] = target_id

        src_filename = os.path.basename(src_path)
        out_filename = src_filename.replace(source_id, target_id)
        out_path = os.path.join(out_dir, out_filename)

        row_counts[module] = len(chunk)

        if not dry_run:
            chunk.to_csv(out_path, index=False)

    return row_counts


def main() -> None:
    _validate_manifest()

    parser = argparse.ArgumentParser(description="Expand 7 source vehicles to 40")
    parser.add_argument("--source-root", required=True)
    parser.add_argument("--out-root", required=True)
    parser.add_argument("--yes", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    source_root = os.path.abspath(args.source_root)
    out_root = os.path.abspath(args.out_root)

    for sid in _SOURCE_IDS:
        if not os.path.isdir(os.path.join(source_root, sid)):
            print(f"ERROR: source directory not found: {os.path.join(source_root, sid)}")
            sys.exit(1)

    active_count = sum(1 for _, cut in MANIFEST.values() if cut >= _ACTIVE_CUT_MIN)
    hist_count = len(MANIFEST) - active_count

    print(f"\nSource root  : {source_root}")
    print(f"Output root  : {out_root}")
    print(f"Cuts         : {N_CUTS} per source (~{34/N_CUTS:.2f} days each over 34-day tyre window)")
    print(f"Cut boundary : cuts 0-{_ACTIVE_CUT_MIN-1} = historical, cuts {_ACTIVE_CUT_MIN}-{N_CUTS-1} = active")
    print(f"Targets      : {len(MANIFEST)} total ({active_count} active, {hist_count} historical)")

    if args.dry_run:
        print("\n[DRY RUN — no files will be written]\n")
    elif not args.yes:
        ans = input("\nProceed? [y/N] ").strip().lower()
        if ans != "y":
            print("Aborted.")
            sys.exit(0)

    source_boundaries: dict[str, list[tuple[pd.Timestamp, pd.Timestamp]]] = {}
    print("\nComputing cut boundaries from tyre module timestamps...")
    for sid in _SOURCE_IDS:
        boundaries = _compute_cut_boundaries(source_root, sid)
        source_boundaries[sid] = boundaries
        hist_end = boundaries[_ACTIVE_CUT_MIN - 1][1]
        active_start = boundaries[_ACTIVE_CUT_MIN][0]
        span_days = (boundaries[-1][1] - boundaries[0][0]).total_seconds() / 86400
        print(
            f"  {sid}: {boundaries[0][0].date()} → {boundaries[-1][1].date()} "
            f"({span_days:.1f} days)  |  history ends {hist_end.date()}  "
            f"active starts {active_start.date()}"
        )

    print(f"\nProcessing {len(MANIFEST)} targets...\n")
    total_written = 0

    by_source: dict[str, list[str]] = {}
    for target_id, (source_id, _) in MANIFEST.items():
        by_source.setdefault(source_id, []).append(target_id)

    for source_id in _SOURCE_IDS:
        targets = sorted(by_source.get(source_id, []))
        print(f"Source {source_id} → {len(targets)} targets")
        for target_id in targets:
            _, cut_index = MANIFEST[target_id]
            boundaries = source_boundaries[source_id]
            cut_start, cut_end = boundaries[cut_index]
            role = "active" if cut_index >= _ACTIVE_CUT_MIN else "historical"
            print(
                f"  {target_id} ← cut {cut_index} [{role}]  "
                f"[{cut_start.strftime('%Y-%m-%d')} → {cut_end.strftime('%Y-%m-%d')}]"
            )
            row_counts = _process_one(
                source_root=source_root,
                out_root=out_root,
                target_id=target_id,
                source_id=source_id,
                cut_index=cut_index,
                boundaries=boundaries,
                dry_run=args.dry_run,
            )
            for module, n in row_counts.items():
                print(f"    {module:14s}: {n:>7,} rows")
            total_written += sum(row_counts.values())

    action = "Would write" if args.dry_run else "Wrote"
    print(f"\n{action} {total_written:,} total rows across {len(MANIFEST)} vehicles.")
    if not args.dry_run:
        print(f"Output: {out_root}")


if __name__ == "__main__":
    main()
