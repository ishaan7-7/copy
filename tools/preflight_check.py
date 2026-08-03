"""
Preflight validation for the streaming emulator.

Verifies every Tier-0 invariant (configs, contracts, vehicle data) before a
run or presentation. Exit code 0 = all checks passed, 1 = failures found.

Usage:
    python tools/preflight_check.py           (samples 5000 rows per CSV)
    python tools/preflight_check.py --full    (scans every row of every CSV)
"""

import argparse
import csv
import json
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, ROOT)

# Contract format: "YYYY-MM-DD HH:MM:SS+ZZ:ZZ" (no fractional seconds).
# A data-generation bug (fix_timestamps.py) once wrote naive,
# millisecond-truncated values like "2024-08-04 08:00:00.000" that every
# downstream consumer chokes on — this check catches that class of defect
# before a stream ever starts, instead of 10 minutes into a live run.
_GOOD_TIMESTAMP_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}([+-]\d{2}:?\d{2})?$")

FAILURES: list = []
WARNINGS: list = []


def check(name: str, ok: bool, detail: str = "") -> None:
    mark = "PASS" if ok else "FAIL"
    line = f"[{mark}] {name}" + (f" — {detail}" if detail else "")
    print(line)
    if not ok:
        FAILURES.append(line)


def warn(name: str, detail: str) -> None:
    line = f"[WARN] {name} — {detail}"
    print(line)
    WARNINGS.append(line)


def load_json(rel_path: str):
    with open(os.path.join(ROOT, rel_path), encoding="utf-8") as fh:
        return json.load(fh)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--full", action="store_true")
    args = parser.parse_args()
    sample_rows = None if args.full else 5000

    manifest = load_json("config/fleet_manifest.json")
    pipeline = load_json("config/pipeline_config.json")
    contract = load_json("contracts/master.json")
    replay_cfg = load_json("replay/config/replay_config.json")
    ingest_cfg = load_json("ingest/config/ingest_config.json")

    active = manifest["active_sims"]
    in_service = manifest["in_service_sims"]
    parked = manifest["parked_sims"]
    a, i, p = set(active), set(in_service), set(parked)

    check("manifest: no duplicate sims within lists",
          len(active) == len(a) and len(in_service) == len(i) and len(parked) == len(p))
    check("manifest: status lists are disjoint", not (a & i or a & p or i & p))
    check("manifest: covers sim001-040 exactly",
          a | i | p == {f"sim{n:03d}" for n in range(1, 41)},
          f"active={len(a)} in_service={len(i)} parked={len(p)}")

    try:
        from tools.fleet_simulator.fleet_config import VEHICLES
        fc = {s: {v["id"] for v in VEHICLES if v["status"] == s}
              for s in ("active", "in_service", "parked")}
        check("manifest matches fleet_config statuses",
              fc["active"] == a and fc["in_service"] == i and fc["parked"] == p,
              f"mismatches: {sorted((fc['active'] ^ a) | (fc['in_service'] ^ i) | (fc['parked'] ^ p)) or 'none'}")
    except Exception as exc:
        check("manifest matches fleet_config statuses", False, f"import error: {exc}")

    enabled = set(replay_cfg["enabled_sims"])
    check("replay enabled_sims == manifest active_sims", enabled == a,
          f"diff: {sorted(enabled ^ a) or 'none'}")

    modules = pipeline["enabled_modules"]
    weights = pipeline["module_weights"]
    check("pipeline: weights defined for every enabled module",
          set(modules) <= set(weights))
    wsum = sum(weights.get(m, 0.0) for m in modules)
    check("pipeline: enabled-module weights sum to 1.0", abs(wsum - 1.0) < 1e-9, f"sum={wsum}")

    cmods = set(contract["modules"])
    check("contract modules == enabled modules", cmods == set(modules),
          f"diff: {sorted(cmods ^ set(modules)) or 'none'}")

    topics = ingest_cfg["topics"]
    check("ingest topics cover enabled modules", set(topics) == set(modules))
    check("ingest topic naming = telemetry.<module>",
          all(v == f"telemetry.{k}" for k, v in topics.items()))

    vehicles_dir = os.path.join(ROOT, "data", "vehicles")
    have_dirs = {d for d in os.listdir(vehicles_dir)
                 if os.path.isdir(os.path.join(vehicles_dir, d))} if os.path.isdir(vehicles_dir) else set()
    missing_dirs = sorted(a - have_dirs)
    check("every active sim has data/vehicles/<sim>/", not missing_dirs,
          f"missing: {missing_dirs or 'none'} (fix: python tools/create_missing_vehicle_data.py --yes)")

    try:
        import pandas as pd
        pandas_ok = True
    except ImportError:
        pandas_ok = False
        warn("csv null scan", "pandas unavailable — skipping null-violation scan")

    csv_issues = 0
    for sim in sorted(a & have_dirs):
        simdir = os.path.join(vehicles_dir, sim)
        files = os.listdir(simdir)
        for mod in modules:
            matches = [f for f in files if mod in f.lower() and f.endswith(".csv")]
            if len(matches) != 1:
                check(f"{sim}/{mod}: exactly one CSV", False, f"found {matches}")
                csv_issues += 1
                continue
            path = os.path.join(simdir, matches[0])
            spec = contract["modules"][mod]["columns"]
            expected = list(spec.keys())
            with open(path, newline="", encoding="utf-8") as fh:
                header = next(csv.reader(fh))
            if header != expected:
                order_only = sorted(header) == sorted(expected)
                check(f"{sim}/{mod}: header matches contract order", False,
                      f"order_only_mismatch={order_only}")
                csv_issues += 1
                continue
            if pandas_ok:
                nn = [k for k, props in spec.items() if not props.get("nullable", True)]
                df = pd.read_csv(path, usecols=nn, nrows=sample_rows)
                nulls = df.isna().sum()
                bad = nulls[nulls > 0]
                if not bad.empty:
                    check(f"{sim}/{mod}: no nulls in non-nullable columns", False,
                          f"violations={dict(bad)}")
                    csv_issues += 1
                if "timestamp" in df.columns:
                    bad_ts = df["timestamp"][~df["timestamp"].astype(str).str.match(_GOOD_TIMESTAMP_PATTERN)]
                    if not bad_ts.empty:
                        check(f"{sim}/{mod}: timestamp format matches contract", False,
                              f"bad_rows={len(bad_ts)} sample={bad_ts.iloc[0]!r} "
                              f"(fix: python tools/repair_vehicle_timestamps.py --yes)")
                        csv_issues += 1
    if csv_issues == 0 and (a & have_dirs):
        scope = "all rows" if args.full else f"first {sample_rows} rows"
        check(f"CSV contract conformance for {len(a & have_dirs)} sims ({scope})", True)

    historical = in_service + parked
    computed_root = os.path.join(ROOT, "data", "computed")
    computed_layers = ["last_state.json", "trips.json", "events.json",
                       "dtcs.json", "alerts.json", "driver_summary.json"]
    computed_bad = []
    for sim in historical:
        simdir = os.path.join(computed_root, sim)
        if not os.path.isdir(simdir):
            computed_bad.append(f"{sim} (no dir)")
            continue
        missing_layers = [l for l in computed_layers
                          if not os.path.exists(os.path.join(simdir, l))]
        if missing_layers:
            computed_bad.append(f"{sim} {missing_layers}")
    check("every historical sim has complete data/computed layers", not computed_bad,
          f"issues: {computed_bad[:4] or 'none'} (fix: python tools/precompute_history.py)")

    batch_gold_root = os.path.join(ROOT, "data", "batch", "gold", "vehicle_health")
    missing_gold = [s for s in historical
                    if not os.path.exists(os.path.join(batch_gold_root, f"{s}.parquet"))]
    check("every historical sim has batch gold health parquet", not missing_gold,
          f"missing: {missing_gold[:6] or 'none'} (fix: run tools/run_silver_historical.py, "
          f"then compute_gold_historical.py, then compute_alerts_historical.py)")

    batch_silver_root = os.path.join(ROOT, "data", "batch", "silver")
    silver_mods = (set(os.listdir(batch_silver_root))
                   if os.path.isdir(batch_silver_root) else set())
    check("batch silver exists for all enabled modules", set(modules) <= silver_mods,
          f"present: {sorted(silver_mods) or 'none'}")

    batch_bronze_root = os.path.join(ROOT, "data", "batch", "bronze")
    missing_bronze = []
    for sim in historical:
        for mod in modules:
            if not os.path.isdir(os.path.join(batch_bronze_root, mod, f"source_id={sim}")):
                missing_bronze.append(f"{sim}/{mod}")
    check("every historical sim has batch bronze (sensor timelines + mileage)",
          not missing_bronze,
          f"missing: {missing_bronze[:6] or 'none'} (fix: python tools/ingest_historical.py — "
          f"batch bronze now lives in data/batch/bronze, outside reset/vacuum reach)")

    rps = float(replay_cfg.get("rows_per_second") or 1)
    min_minutes = 75
    short_streams = []
    for sim in sorted(a & have_dirs):
        simdir = os.path.join(vehicles_dir, sim)
        for f in os.listdir(simdir):
            if not f.endswith(".csv"):
                continue
            with open(os.path.join(simdir, f), "rb") as fh:
                row_count = sum(chunk.count(b"\n") for chunk in iter(lambda: fh.read(1 << 20), b"")) - 1
            minutes = row_count / rps / 60
            if minutes < min_minutes:
                short_streams.append(f"{sim}/{f} ({minutes:.0f} min)")
    if short_streams:
        warn("stream duration", f"CSVs under {min_minutes} min at {rps} rows/s (replay loops them seamlessly): {short_streams[:5]}"
             + (f" +{len(short_streams) - 5} more" if len(short_streams) > 5 else ""))
    else:
        check(f"every active CSV covers >= {min_minutes} min at {rps} rows/s", True)

    print()
    if FAILURES:
        print(f"PREFLIGHT FAILED — {len(FAILURES)} check(s) failed, {len(WARNINGS)} warning(s).")
        return 1
    print(f"PREFLIGHT PASSED — all checks green, {len(WARNINGS)} warning(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
