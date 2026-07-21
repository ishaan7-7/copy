"""
fix_mileage.py
==============
Rewrites odometer_reading in body CSVs using the same 1-Hz-tuned
speed backbone as fix_vehicle_physics.py.

Speed backbone: behavioural state machine per trip segment.
  Urban:   RAMP_UP → CRUISE → DECEL → STOP → repeat
  Highway: RAMP_UP → CRUISE → (occasional SLOWDOWN) → repeat
This produces realistic odometer curves on timeline plots — smooth
growth within trips, flat during parked gaps, clear trip structure.
"""

import sys
import math
import hashlib
import numpy as np
import pandas as pd
from pathlib import Path

ROOT_DIR      = Path(__file__).parent.parent.resolve()
VEHICLES_ROOT = ROOT_DIR / "data" / "vehicles"

# ── Gap detection ─────────────────────────────────────────────────────────────

GAP_MULTIPLIER = 5
GAP_MIN_S      = 300

# ── Odometer start ────────────────────────────────────────────────────────────

ODO_BASE_MIN   = 25_000
ODO_BASE_RANGE = 115_000

# ── Trip mode split ───────────────────────────────────────────────────────────

URBAN_TRIP_PROB = 0.55

# ── Urban state machine constants (identical to fix_vehicle_physics.py) ───────

U_TARGET_MIN   = 16.0
U_TARGET_MAX   = 36.0
U_MAX          = 48.0

U_CRUISE_AR    = 0.997
U_CRUISE_STD   = 2.0
U_CRUISE_MIN_S = 45
U_CRUISE_MAX_S = 240

U_RAMP_MIN_S   = 10
U_RAMP_MAX_S   = 25

U_DECEL_MIN_S  = 8
U_DECEL_MAX_S  = 20

U_STOP_MIN_S   = 30
U_STOP_MAX_S   = 120

# ── Highway state machine constants (identical to fix_vehicle_physics.py) ─────

H_TARGET_MIN   = 72.0
H_TARGET_MAX   = 84.0
H_MAX          = 88.0

H_CRUISE_AR    = 0.9985
H_CRUISE_STD   = 1.5
H_CRUISE_MIN_S = 180
H_CRUISE_MAX_S = 900

H_RAMP_MIN_S   = 60
H_RAMP_MAX_S   = 120

H_SLOW_MIN_V   = 10.0
H_SLOW_MAX_V   = 35.0
H_SLOW_DECEL   = (30, 61)
H_SLOW_DWELL   = (15, 61)
H_SLOW_ACCEL   = (30, 91)
H_SLOW_PROB    = 0.25
H_SLOW_REM_MIN = 120


# ── Deterministic RNG ─────────────────────────────────────────────────────────

def _rng(sim_id: str, salt: str = "") -> np.random.Generator:
    digest = hashlib.sha256(f"{sim_id}:{salt}".encode()).digest()
    seed   = int.from_bytes(digest[:8], "big")
    return np.random.default_rng(seed)


# ── Speed state machine ───────────────────────────────────────────────────────

def _urban_profile(n: int, rng: np.random.Generator) -> np.ndarray:
    out           = np.zeros(n, dtype=np.float64)
    i             = 0
    state         = "RAMP_UP"
    cruise_target = float(rng.uniform(U_TARGET_MIN, U_TARGET_MAX))
    inn_std       = U_CRUISE_STD * math.sqrt(max(1.0 - U_CRUISE_AR ** 2, 1e-9))

    while i < n:
        rem = n - i

        if state == "RAMP_UP":
            dur   = min(int(rng.integers(U_RAMP_MIN_S, U_RAMP_MAX_S + 1)), rem)
            start = out[i - 1] if i > 0 else 0.0
            out[i:i + dur] = np.linspace(start, cruise_target, dur)
            i    += dur
            state = "CRUISE"

        elif state == "CRUISE":
            dur = min(int(rng.integers(U_CRUISE_MIN_S, U_CRUISE_MAX_S + 1)), rem)
            v   = out[i - 1] if i > 0 else cruise_target
            for j in range(dur):
                v = U_CRUISE_AR * v + (1.0 - U_CRUISE_AR) * cruise_target \
                    + rng.normal(0.0, inn_std)
                out[i + j] = float(np.clip(v, 0.0, U_MAX))
            i    += dur
            state = "DECEL"

        elif state == "DECEL":
            dur   = min(int(rng.integers(U_DECEL_MIN_S, U_DECEL_MAX_S + 1)), rem)
            start = out[i - 1] if i > 0 else 0.0
            out[i:i + dur] = np.linspace(start, 0.0, dur)
            i    += dur
            state = "STOP"

        else:  # STOP
            dur   = min(int(rng.integers(U_STOP_MIN_S, U_STOP_MAX_S + 1)), rem)
            out[i:i + dur] = 0.0
            i            += dur
            cruise_target = float(rng.uniform(U_TARGET_MIN, U_TARGET_MAX))
            state         = "RAMP_UP"

    return out


def _highway_profile(n: int, rng: np.random.Generator) -> np.ndarray:
    out           = np.zeros(n, dtype=np.float64)
    i             = 0
    state         = "RAMP_UP"
    cruise_target = float(rng.uniform(H_TARGET_MIN, H_TARGET_MAX))
    inn_std       = H_CRUISE_STD * math.sqrt(max(1.0 - H_CRUISE_AR ** 2, 1e-9))

    while i < n:
        rem = n - i

        if state == "RAMP_UP":
            dur   = min(int(rng.integers(H_RAMP_MIN_S, H_RAMP_MAX_S + 1)), rem)
            start = out[i - 1] if i > 0 else 0.0
            out[i:i + dur] = np.linspace(start, cruise_target, dur)
            i    += dur
            state = "CRUISE"

        elif state == "CRUISE":
            dur = min(int(rng.integers(H_CRUISE_MIN_S, H_CRUISE_MAX_S + 1)), rem)
            v   = out[i - 1] if i > 0 else cruise_target
            for j in range(dur):
                v = H_CRUISE_AR * v + (1.0 - H_CRUISE_AR) * cruise_target \
                    + rng.normal(0.0, inn_std)
                out[i + j] = float(np.clip(v, 50.0, H_MAX))
            i += dur
            if rng.random() < H_SLOW_PROB and (n - i) > H_SLOW_REM_MIN:
                state = "SLOWDOWN"
            else:
                cruise_target = float(rng.uniform(H_TARGET_MIN, H_TARGET_MAX))
                state         = "CRUISE"

        else:  # SLOWDOWN
            slow_v = float(rng.uniform(H_SLOW_MIN_V, H_SLOW_MAX_V))
            d_dur  = min(int(rng.integers(*H_SLOW_DECEL)), rem)
            s_dur  = min(int(rng.integers(*H_SLOW_DWELL)), max(0, rem - d_dur))
            a_dur  = min(int(rng.integers(*H_SLOW_ACCEL)),
                         max(0, rem - d_dur - s_dur))
            cur_v  = out[i - 1] if i > 0 else cruise_target

            if d_dur > 0:
                out[i:i + d_dur] = np.linspace(cur_v, slow_v, d_dur)
                i += d_dur
            if s_dur > 0:
                out[i:i + s_dur] = slow_v
                i += s_dur
            if a_dur > 0:
                out[i:i + a_dur] = np.linspace(slow_v, cruise_target, a_dur)
                i += a_dur

            cruise_target = float(rng.uniform(H_TARGET_MIN, H_TARGET_MAX))
            state         = "CRUISE"

    return out


def build_speed_series(
    n_rows: int,
    dt_s: np.ndarray,
    gap_threshold_s: float,
    sim_id: str,
) -> np.ndarray:
    """
    Build trip-segmented speed array (km/h).  Each trip segment gets its
    own behavioural profile seeded from sim_id and trip index.
    """
    speeds = np.zeros(n_rows, dtype=np.float64)
    if n_rows <= 1:
        return speeds

    gap_mask    = dt_s > gap_threshold_s
    trip_starts = [0] + list(np.where(gap_mask)[0] + 1)
    trip_ends   = trip_starts[1:] + [n_rows]
    mode_rng    = _rng(sim_id, "modes")

    for t_idx, (t_start, t_end) in enumerate(zip(trip_starts, trip_ends)):
        t_len = t_end - t_start
        if t_len <= 0:
            continue
        t_rng = _rng(sim_id, f"trip_{t_idx}")
        mode  = "urban" if mode_rng.random() < URBAN_TRIP_PROB else "highway"
        prof  = (_urban_profile(t_len, t_rng) if mode == "urban"
                 else _highway_profile(t_len, t_rng))

        end_rows = min(60 if mode == "urban" else 90, t_len // 8)
        if end_rows > 1:
            v0 = float(prof[t_len - end_rows - 1]) if t_len > end_rows else 0.0
            prof[t_len - end_rows:] = np.linspace(v0, 0.0, end_rows)

        speeds[t_start:t_end] = prof

    return speeds


# ── Odometer computation ──────────────────────────────────────────────────────

def compute_odometer(
    timestamps: pd.Series,
    base_km: float,
    gap_threshold_s: float,
    sim_id: str,
) -> np.ndarray:
    n      = len(timestamps)
    odo    = np.empty(n, dtype=np.float64)
    odo[0] = base_km

    if n == 1:
        return odo

    ts_ns  = timestamps.values.astype("datetime64[ns]").astype(np.int64)
    dt_s   = np.maximum(np.diff(ts_ns) / 1e9, 0.0)
    speeds = build_speed_series(n, dt_s, gap_threshold_s, sim_id)

    for i in range(1, n):
        if dt_s[i - 1] > gap_threshold_s:
            odo[i] = odo[i - 1]
        else:
            delta_km = speeds[i] * (dt_s[i - 1] / 3600.0)
            odo[i]   = odo[i - 1] + delta_km

    return odo


# ── Timestamp analysis ────────────────────────────────────────────────────────

def analyse_timestamps(ts: pd.Series) -> dict:
    dt_s      = ts.diff().dt.total_seconds().dropna()
    median_dt = float(dt_s.median()) if not dt_s.empty else 1.0
    gap_thr   = max(GAP_MULTIPLIER * median_dt, GAP_MIN_S)
    n_gaps    = int((dt_s > gap_thr).sum())
    span_s    = (ts.iloc[-1] - ts.iloc[0]).total_seconds() if len(ts) > 1 else 0.0
    return {
        "rows":            len(ts),
        "median_dt_s":     round(median_dt, 3),
        "gap_threshold_s": round(gap_thr, 1),
        "n_gaps":          n_gaps,
        "n_trips":         n_gaps + 1,
        "span_hours":      round(span_s / 3600.0, 3),
    }


# ── Discovery ─────────────────────────────────────────────────────────────────

def discover_sims(root: Path) -> list:
    sims = []
    if not root.exists():
        print(f"[ERROR] Vehicles root not found: {root}")
        return sims
    for sim_dir in sorted(root.iterdir()):
        if not sim_dir.is_dir():
            continue
        sim_id     = sim_dir.name
        candidates = sorted(sim_dir.glob("*body*scenarioA*.csv"))
        if not candidates:
            candidates = sorted(sim_dir.glob("*body*.csv"))
        if candidates:
            sims.append((sim_id, candidates[0]))
        else:
            print(f"  [WARN] {sim_id}: no body CSV found — skipped")
    return sims


# ── Per-sim fix ───────────────────────────────────────────────────────────────

def fix_sim(sim_id: str, body_csv: Path, dry_run: bool = False) -> dict:
    print(f"\n{'=' * 62}")
    print(f"  SIM: {sim_id}   FILE: {body_csv.name}")
    print(f"{'=' * 62}")

    df = pd.read_csv(body_csv, low_memory=False)
    original_cols = list(df.columns)

    missing = [c for c in ("timestamp", "odometer_reading") if c not in df.columns]
    if missing:
        print(f"  [ERROR] Missing columns {missing} — skipped")
        return {}

    df["_ts"] = pd.to_datetime(df["timestamp"], utc=True, errors="coerce")
    n_nat     = df["_ts"].isna().sum()
    if n_nat:
        print(f"  [WARN]  Dropping {n_nat} rows with unparseable timestamps")
    df = df.dropna(subset=["_ts"]).sort_values("_ts").reset_index(drop=True)

    stats = analyse_timestamps(df["_ts"])
    base  = float(ODO_BASE_MIN + _rng(sim_id, "base").integers(0, ODO_BASE_RANGE))

    print(f"  Rows          : {stats['rows']:,}")
    print(f"  Time span     : {stats['span_hours']:.2f} h")
    print(f"  Median dt     : {stats['median_dt_s']} s")
    print(f"  Gap threshold : {stats['gap_threshold_s']} s  "
          f"({stats['gap_threshold_s'] / 60:.1f} min)")
    print(f"  Trips         : {stats['n_trips']}  |  Gaps : {stats['n_gaps']}")
    print(f"  Base odometer : {base:,.0f} km")

    odo = compute_odometer(
        df["_ts"],
        base_km=base,
        gap_threshold_s=stats["gap_threshold_s"],
        sim_id=sim_id,
    )

    total_km  = float(odo[-1] - odo[0])
    is_mono   = bool(np.all(np.diff(odo) >= -1e-9))
    avg_speed = total_km / max(stats["span_hours"], 1e-9)

    print(f"\n  End odometer  : {odo[-1]:,.1f} km")
    print(f"  Total km added: {total_km:,.1f} km")
    print(f"  Avg km/h      : {avg_speed:.1f}  (incl. parked time)")
    print(f"  Monotonic     : {is_mono}")

    if not is_mono:
        print("  [ERROR] Non-monotonic result — aborting write for this sim")
        return {}

    if dry_run:
        print("  [DRY RUN] No file written.")
        return {**stats, "base_km": base, "end_km": float(odo[-1]),
                "total_km": total_km, "is_monotonic": is_mono}

    df["odometer_reading"] = np.round(odo, 3)
    df["timestamp"]        = df["_ts"].dt.strftime("%Y-%m-%d %H:%M:%S+00:00")
    df                     = df[original_cols]
    df.to_csv(body_csv, index=False)
    print(f"  [DONE] Written to {body_csv}")

    return {**stats, "base_km": base, "end_km": float(odo[-1]),
            "total_km": total_km, "is_monotonic": is_mono}


# ── Entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    args    = sys.argv[1:]
    dry_run = "--dry-run" in args

    root = VEHICLES_ROOT
    if "--root" in args:
        idx = args.index("--root")
        if idx + 1 < len(args):
            root = Path(args[idx + 1])
        else:
            print("[ERROR] --root requires a path argument")
            sys.exit(1)

    print("\n== fix_mileage.py ==========================================")
    print(f"   Vehicles root : {root}")
    print(f"   Mode          : {'DRY RUN (no writes)' if dry_run else 'LIVE (files will be overwritten)'}")
    print("============================================================\n")

    if not dry_run and "--yes" not in args:
        confirm = input("This will overwrite all body CSVs. Continue? (y/n): ").strip().lower()
        if confirm not in ("y", "yes"):
            print("Aborted.")
            sys.exit(0)

    sims = discover_sims(root)
    if not sims:
        print("[ERROR] No sims found.")
        sys.exit(1)

    print(f"\nFound {len(sims)} sim(s): {[s for s, _ in sims]}\n")

    results: dict = {}
    for sim_id, body_csv in sims:
        try:
            results[sim_id] = fix_sim(sim_id, body_csv, dry_run=dry_run)
        except Exception as exc:
            import traceback
            print(f"\n  [ERROR] {sim_id} failed: {exc}")
            traceback.print_exc()

    print("\n\n== Summary =================================================")
    hdr = f"{'Sim':<10} {'Rows':>8} {'Trips':>6} {'Base km':>10} {'End km':>10} {'Total km':>10} {'Mono':>5}"
    print(hdr)
    print("-" * len(hdr))
    for sim_id, r in results.items():
        if not r:
            print(f"{sim_id:<10}  (skipped)")
            continue
        print(
            f"{sim_id:<10} {r['rows']:>8,} {r['n_trips']:>6} "
            f"{r['base_km']:>10,.0f} {r['end_km']:>10,.0f} "
            f"{r['total_km']:>10,.1f} {str(r['is_monotonic']):>5}"
        )
    print("============================================================\n")


if __name__ == "__main__":
    main()
