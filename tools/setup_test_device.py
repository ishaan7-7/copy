"""
One-time test-device setup after the historical-bronze relocation.

Rebuilds the entire historical/batch layer in its new home (data/batch/),
where hard resets and bronze compaction can never delete it, then validates
everything with the full preflight suite.

Steps (idempotent — safe to re-run):
  1. Remove stale historical batch.parquet files from the LIVE bronze tree
     (data/delta/bronze) left by the old ingest path.
  2. tools/ingest_historical.py  -> data/batch/bronze   (skipped if complete)
  3. tools/run_silver_historical.py -> data/batch/silver (skipped if complete)
  4. tools/compute_gold_historical.py -> data/batch/gold/vehicle_health
  5. tools/compute_alerts_historical.py -> data/batch/gold/alerts
  6. tools/preflight_check.py --full  (must end green)
  7. Optional: --build-frontend builds the static dashboard bundle so the
     backend serves it at http://127.0.0.1:8005 (run.py then skips Vite).

Usage:
    python tools/setup_test_device.py [--data-root <expanded-csv-root>]
                                      [--force] [--build-frontend] [--yes]

--data-root is only needed if step 2 must run and auto-detection fails; it is
the expanded per-vehicle CSV root produced by expand_vehicles.py (a folder
containing sim006/, sim011/, ... each with one CSV per module).
"""

import argparse
import json
import os
import subprocess
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
VENV_PYTHON = os.path.join(ROOT, ".venv", "Scripts", "python.exe")
PYTHON = VENV_PYTHON if os.path.exists(VENV_PYTHON) else sys.executable

MODULES = ["engine", "transmission", "battery", "body", "tyre"]
LIVE_BRONZE = os.path.join(ROOT, "data", "delta", "bronze")
BATCH_BRONZE = os.path.join(ROOT, "data", "batch", "bronze")
BATCH_SILVER = os.path.join(ROOT, "data", "batch", "silver")


def _historical_sims() -> list:
    with open(os.path.join(ROOT, "config", "fleet_manifest.json"), encoding="utf-8") as fh:
        m = json.load(fh)
    return m["in_service_sims"] + m["parked_sims"]


def _run_step(label: str, cmd: list) -> None:
    print(f"\n=== {label} ===")
    print("    " + " ".join(os.path.relpath(c, ROOT) if os.path.isabs(c) else c for c in cmd))
    result = subprocess.run(cmd, cwd=ROOT)
    if result.returncode != 0:
        print(f"\nFAILED at step: {label} (exit {result.returncode}). Fix the error above and re-run this script.")
        sys.exit(result.returncode)


def _batch_bronze_complete(historical: list) -> bool:
    for vid in historical:
        for mod in MODULES:
            part = os.path.join(BATCH_BRONZE, mod, f"source_id={vid}")
            if not os.path.isdir(part) or not any(f.endswith(".parquet") for f in os.listdir(part)):
                return False
    return True


def _batch_silver_complete(historical: list) -> bool:
    for vid in historical:
        for mod in MODULES:
            if not os.path.exists(os.path.join(BATCH_SILVER, mod, f"source_id={vid}", "silver.parquet")):
                return False
    return True


def _clean_stale_live_bronze(historical: list) -> None:
    removed = 0
    for mod in MODULES:
        for vid in historical:
            stale = os.path.join(LIVE_BRONZE, mod, f"source_id={vid}", "batch.parquet")
            if os.path.exists(stale):
                try:
                    os.remove(stale)
                    removed += 1
                except OSError as exc:
                    print(f"    WARN could not remove {stale}: {exc}")
    print(f"\n=== Step 1: cleanup stale historical files in live bronze ===")
    print(f"    Removed {removed} stale batch.parquet file(s) from data/delta/bronze.")


def _detect_data_root(historical: list) -> str | None:
    probe_sim = historical[0]
    candidates = []
    for base in (ROOT, os.path.join(ROOT, "data"), os.path.join(ROOT, "cut_data")):
        if not os.path.isdir(base):
            continue
        for name in os.listdir(base):
            d = os.path.join(base, name)
            if os.path.isdir(os.path.join(d, probe_sim)):
                sim_dir = os.path.join(d, probe_sim)
                if any(f.endswith(".csv") for f in os.listdir(sim_dir)):
                    candidates.append(d)
    return candidates[0] if candidates else None


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-root", default="")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--build-frontend", action="store_true", dest="build_frontend")
    parser.add_argument("--yes", action="store_true")
    args = parser.parse_args()

    historical = _historical_sims()
    tools = os.path.join(ROOT, "tools")

    print("TEST DEVICE SETUP — historical/batch layer migration")
    print(f"  Project root    : {ROOT}")
    print(f"  Historical sims : {len(historical)}")
    print(f"  Target layers   : data/batch/{{bronze,silver,gold}}")
    if not args.yes:
        ans = input("\nProceed? [y/N] ").strip().lower()
        if ans != "y":
            print("Aborted.")
            return

    _clean_stale_live_bronze(historical)

    if not args.force and _batch_bronze_complete(historical):
        print("\n=== Step 2: ingest_historical — SKIPPED (batch bronze already complete; use --force to rebuild) ===")
    else:
        data_root = args.data_root or _detect_data_root(historical)
        if not data_root:
            print("\nFAILED: cannot find the expanded per-vehicle CSV root (looked for a folder "
                  f"containing {historical[0]}/ with CSVs under the project root, data/, and cut_data/).")
            print("Pass it explicitly:  python tools/setup_test_device.py --data-root <path> --yes")
            sys.exit(1)
        print(f"\n    Using data root: {data_root}")
        _run_step("Step 2: ingest historical CSVs -> data/batch/bronze",
                  [PYTHON, os.path.join(tools, "ingest_historical.py"), "--data-root", data_root, "--yes"])

    if not args.force and _batch_silver_complete(historical):
        print("\n=== Step 3: run_silver_historical — SKIPPED (batch silver already complete; use --force to rebuild) ===")
    else:
        _run_step("Step 3: batch LSTM inference -> data/batch/silver",
                  [PYTHON, os.path.join(tools, "run_silver_historical.py"), "--yes"])

    _run_step("Step 4: batch gold health -> data/batch/gold/vehicle_health",
              [PYTHON, os.path.join(tools, "compute_gold_historical.py"), "--yes"])

    _run_step("Step 5: batch alerts -> data/batch/gold/alerts",
              [PYTHON, os.path.join(tools, "compute_alerts_historical.py"), "--yes"])

    if args.build_frontend:
        node_dir = os.path.join(ROOT, "tools", "node")
        npm_cmd = os.path.join(node_dir, "npm.cmd")
        if os.path.exists(npm_cmd):
            env = os.environ.copy()
            env["PATH"] = node_dir + os.pathsep + env.get("PATH", "")
            env["npm_config_cache"] = os.path.join(ROOT, "tools", "npm_cache")
            print("\n=== Step 6: building static frontend (npm run build) ===")
            result = subprocess.run(f'"{npm_cmd}" run build', shell=True,
                                    cwd=os.path.join(ROOT, "master_dashboard", "frontend"), env=env)
            if result.returncode != 0:
                print("FAILED: frontend build — dashboard will still work via Vite dev server.")
            else:
                print("    Built. run.py will now serve the dashboard at http://127.0.0.1:8005 and skip Vite.")
        else:
            print("\n=== Step 6: SKIPPED — bundled Node.js not found (run setup.bat first) ===")

    _run_step("Final: full preflight validation",
              [PYTHON, os.path.join(tools, "preflight_check.py"), "--full"])

    print("\nSETUP COMPLETE — all preflight checks green.")
    print("Next: python run.py --reset  (hard reset), then start services and replay as usual.")


if __name__ == "__main__":
    main()
