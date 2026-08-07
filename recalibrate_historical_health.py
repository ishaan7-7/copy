"""
Recalibrates precomputed batch Silver health_score trajectories for historical
(parked / in_service) vehicles so they gradually converge on the same
end-state health that fleet_config.py's hand-authored seed already shows in
the Fleet Table / vehicle summary header — instead of whatever value the raw
LSTM inference on the ingested historical CSVs happened to land on.

Why: fleet_config.py's "health"/"module_health" fields were always a
hand-authored seed used only to *generate* the synthetic trip/DTC data
(see precompute_history.py's docstring at the top of _load_last_batch_gold) —
never a measurement. The real batch Silver/Gold layer is a genuine,
independent computation from run_silver_historical.py's LSTM inference, and
nothing ever calibrated it toward that seed. This produced two different
"health" numbers for the same vehicle depending on which UI surface you
looked at.

What this script does, per historical vehicle x per module:
  1. Backs up the current silver.parquet once (silver.original.parquet) so
     repeated runs always recompute from the same real-inference baseline
     instead of compounding on a previously recalibrated file.
  2. Extracts that original run's own noise residual (health_score minus its
     own rolling trend) — this is "what real inference actually produced",
     preserved verbatim.
  3. Builds a new smooth trend from a healthy baseline (~90-96%) down to a
     per-module target, tapering the residual's amplitude to ~0 over the
     final few percent of rows so the last window settles cleanly on target
     instead of ending mid-noise-swing.
  4. Re-derives severity/severity_code from the new health_score (same
     thresholds ml_engine.MLEngine._classify_severity uses). Every other
     column (top_features, lstm_raw_error, lstm_smoothed, composite_score,
     timestamps, row_hash) is left untouched — this script only recalibrates
     the derived health signal, not the underlying raw-sensor evidence.

Per-module targets are fleet_config.py's module_health values scaled by a
single per-vehicle factor so their pipeline_config.json-weighted sum lands
exactly on fleet_config.py's "health" value (the two aren't perfectly
consistent with each other as hand-authored — this makes them so, without
visibly moving either the Fleet Table number or the module numbers).

Run AFTER the normal setup_test_device.py pipeline has produced
data/batch/silver (i.e. only makes sense once real Silver data exists).
Run BEFORE compute_gold_historical.py and precompute_history.py, then
re-run both of those so Gold and data/computed/*/last_state.json (which
fleet_sim_server.py serves, and which Fleet Table / Cockpit cards / the
Summary popup header / the AI executive summary / the chatbot all trace
back to) pick up the now-consistent value.

Usage:
    python tools/recalibrate_historical_health.py [--vehicles sim006,sim017] [--yes] [--dry-run]
"""

import argparse
import hashlib
import json
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "fleet_simulator"))
from fleet_config import VEHICLES  # noqa: E402

MODULES = ["engine", "transmission", "battery", "body", "tyre"]

_PROJ_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
_CFG_PATH = os.path.join(_PROJ_ROOT, "config", "pipeline_config.json")
BATCH_SILVER_ROOT = os.path.join(_PROJ_ROOT, "data", "batch", "silver")

with open(_CFG_PATH) as _f:
    _raw_weights: dict[str, float] = json.load(_f)["module_weights"]
_weight_sum = sum(_raw_weights.values())
NORMALIZED_WEIGHTS = {m: w / _weight_sum for m, w in _raw_weights.items()}

_HISTORICAL_VEHICLES = [v for v in VEHICLES if v["status"] != "active"]

# Every module's trend starts near a healthy baseline and degrades toward
# its target — confirmed with the user: both in_service (severe decline,
# explains the workshop visit) and parked (milder decline, explains why
# it's idle but not urgent) tell the same degradation story, just at
# different severities driven entirely by how low each vehicle's target is.
_BASELINE_MIN = 90.0
_BASELINE_MAX = 96.0
# Ease exponent >1 => slow initial decline, steeper near the end (a vehicle
# degrading gradually before finally crossing into "needs service" territory
# reads as more plausible than a straight line).
_EASE_POWER = 1.15
# Low-amplitude, low-frequency wobble on top of the eased trend so the curve
# isn't a suspiciously clean monotonic line — small enough to never reverse
# the overall direction.
_WOBBLE_AMPLITUDE_FRAC = 0.035
_WOBBLE_CYCLES = 1.5
# Fraction of the series (from the end) over which residual noise amplitude
# tapers to ~0, so the last Gold window settles cleanly on the target instead
# of landing mid noise-swing.
_TAPER_FRAC = 0.06


def _vehicle_module_targets(v: dict) -> dict[str, float]:
    mh = v["module_health"]
    weighted = sum(mh[m] * NORMALIZED_WEIGHTS[m] for m in NORMALIZED_WEIGHTS)
    if weighted <= 0:
        return dict(mh)
    scale = v["health"] / weighted
    return {m: round(mh[m] * scale, 2) for m in NORMALIZED_WEIGHTS}


def _seeded_rng(vehicle_id: str, module: str) -> np.random.Generator:
    key = f"recalibrate|{vehicle_id}|{module}"
    seed = int(hashlib.sha256(key.encode()).hexdigest()[:8], 16)
    return np.random.default_rng(seed)


def _classify_severity(health: float) -> str:
    if health < 50:
        return "CRITICAL"
    if health < 65:
        return "WARNING"
    return "NORMAL"


def _extract_residual(health_score: np.ndarray) -> np.ndarray:
    n = len(health_score)
    window = max(5, min(n, n // 20))
    s = pd.Series(health_score)
    trend = s.rolling(window=window, center=True, min_periods=1).mean().to_numpy()
    return health_score - trend


def _build_new_trend(n: int, baseline: float, target: float, rng: np.random.Generator) -> np.ndarray:
    t = np.linspace(0.0, 1.0, n)
    eased = t**_EASE_POWER
    trend = baseline + (target - baseline) * eased
    amplitude = abs(baseline - target) * _WOBBLE_AMPLITUDE_FRAC
    phase = rng.uniform(0, 2 * np.pi)
    wobble = amplitude * np.sin(2 * np.pi * _WOBBLE_CYCLES * t + phase)
    # Fade the wobble out near both ends so it never overshoots the starting
    # baseline early on or drags the final value off target late.
    edge_fade = np.clip(np.minimum(t / 0.08, (1 - t) / 0.08), 0.0, 1.0)
    return trend + wobble * edge_fade


def _taper_residual(residual: np.ndarray, n: int) -> np.ndarray:
    taper_len = max(1, int(n * _TAPER_FRAC))
    fade = np.ones(n)
    fade[n - taper_len :] = np.linspace(1.0, 0.0, taper_len)
    return residual * fade


def _recalibrate_module(vid: str, module: str, target: float, dry_run: bool) -> tuple[bool, str]:
    part_dir = os.path.join(BATCH_SILVER_ROOT, module, f"source_id={vid}")
    live_path = os.path.join(part_dir, "silver.parquet")
    backup_path = os.path.join(part_dir, "silver.original.parquet")

    if not os.path.exists(live_path) and not os.path.exists(backup_path):
        return False, "no silver.parquet found — skipping"

    if os.path.exists(backup_path):
        df = pd.read_parquet(backup_path)
        source_label = "silver.original.parquet (repeat run)"
    else:
        df = pd.read_parquet(live_path)
        source_label = "silver.parquet (first run)"

    if df.empty or "health_score" not in df.columns:
        return False, "empty or missing health_score column — skipping"

    ts_col = next((c for c in ("timestamp", "inference_ts", "ingest_ts") if c in df.columns), None)
    if ts_col:
        df = df.sort_values(ts_col).reset_index(drop=True)

    n = len(df)
    original_health = df["health_score"].to_numpy(dtype=float)
    residual = _extract_residual(original_health)
    residual = _taper_residual(residual, n)

    rng = _seeded_rng(vid, module)
    baseline = rng.uniform(_BASELINE_MIN, _BASELINE_MAX)
    new_trend = _build_new_trend(n, baseline, target, rng)

    new_health = np.clip(new_trend + residual, 0.0, 100.0)
    # Force the very last row to the exact target — this is what
    # compute_gold_historical.py's final window (and therefore
    # precompute_history.py's last_state.json) will read as "current".
    new_health[-1] = target
    new_health = np.round(new_health, 2)

    df["health_score"] = new_health
    df["severity"] = [_classify_severity(h) for h in new_health]
    if "severity_code" in df.columns:
        df["severity_code"] = df["severity"].map({"NORMAL": 0, "WARNING": 1, "CRITICAL": 2})

    msg = (
        f"{n:,} rows from {source_label}: "
        f"baseline={baseline:.1f} -> target={target:.1f}, "
        f"first={new_health[0]:.1f}, last={new_health[-1]:.1f}"
    )

    if dry_run:
        return True, f"[DRY] {msg}"

    if not os.path.exists(backup_path):
        # Read fresh (not the possibly-already-loaded df) to guarantee an
        # untouched copy of the real inference output.
        pd.read_parquet(live_path).to_parquet(backup_path, index=False)

    df.to_parquet(live_path, index=False)
    return True, msg


def main() -> None:
    parser = argparse.ArgumentParser(description="Recalibrate historical vehicle health trajectories")
    parser.add_argument("--vehicles", default="", help="Comma-separated vehicle ids (default: all historical)")
    parser.add_argument("--yes", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    wanted = set(args.vehicles.split(",")) if args.vehicles else None
    vehicles = [v for v in _HISTORICAL_VEHICLES if not wanted or v["id"] in wanted]

    print(f"\nBatch Silver root : {BATCH_SILVER_ROOT}")
    print(f"Vehicles          : {len(vehicles)} historical")
    print(f"Module weights    : {NORMALIZED_WEIGHTS}\n")

    if not vehicles:
        print("No matching historical vehicles found.")
        sys.exit(1)

    if args.dry_run:
        print("[DRY RUN — no files will be written]\n")
    elif not args.yes:
        ans = input("Proceed? [y/N] ").strip().lower()
        if ans != "y":
            print("Aborted.")
            sys.exit(0)

    total_ok = 0
    total_skip = 0
    for v in vehicles:
        vid = v["id"]
        targets = _vehicle_module_targets(v)
        print(f"  {vid}  ({v['status']}, target health={v['health']})")
        for module in MODULES:
            ok, msg = _recalibrate_module(vid, module, targets[module], args.dry_run)
            tag = "OK  " if ok else "SKIP"
            print(f"    {tag} {module:14s} target={targets[module]:6.2f}  {msg}")
            total_ok += int(ok)
            total_skip += int(not ok)

    action = "Would recalibrate" if args.dry_run else "Recalibrated"
    print(f"\n{action} {total_ok} module file(s), skipped {total_skip}, across {len(vehicles)} vehicles.")
    if not args.dry_run and total_ok:
        print("\nNext steps:")
        print("  python tools/compute_gold_historical.py --yes")
        print("  python tools/precompute_history.py --computed-root data/computed --yes")
        print("  (restart automotive_api / fleet_sim_server so caches pick up the new files)")


if __name__ == "__main__":
    main()
