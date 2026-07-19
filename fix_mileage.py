import sys
import math
import hashlib
import numpy as np
import pandas as pd
from pathlib import Path

ROOT_DIR      = Path(__file__).parent.parent.resolve()
VEHICLES_ROOT = ROOT_DIR / "data" / "vehicles"

# ── Tuning constants ──────────────────────────────────────────────────────────

GAP_MULTIPLIER  = 5        # gap = max(GAP_MULTIPLIER * median_dt, GAP_MIN_S)
GAP_MIN_S       = 300      # hard floor on gap threshold (5 min)
URBAN_TRIP_PROB = 0.55     # probability a trip segment is classified as urban
ODO_BASE_MIN    = 25_000   # minimum starting odometer (km)
ODO_BASE_RANGE  = 115_000  # spread of starting odometer across the fleet (km)

# Urban speed profile — medium-heavy diesel truck, Indian intercity fleet
URBAN_MEAN_KMH  = 22.0
URBAN_STD_KMH   = 11.0
URBAN_AR        = 0.87
URBAN_MAX_KMH   = 48.0
URBAN_STOP_PROB = 0.06     # per-row probability of entering a stop (~50% time at stop)
URBAN_STOP_MIN  = 4        # minimum stop duration (seconds)
URBAN_STOP_MAX  = 30       # maximum stop duration (seconds)
URBAN_EMA_ALPHA = 0.12

# Highway speed profile — governed at 88 km/h
HWY_MEAN_KMH   = 76.0
HWY_STD_KMH    = 6.0
HWY_AR         = 0.97
HWY_MIN_KMH    = 50.0
HWY_MAX_KMH    = 88.0
HWY_SLOW_PROB  = 0.008     # toll plazas / speed bumps
HWY_SLOW_MIN   = 8
HWY_SLOW_MAX   = 25
HWY_EMA_ALPHA  = 0.04


# ── Deterministic RNG ─────────────────────────────────────────────────────────

def _rng(sim_id: str, salt: str = "") -> np.random.Generator:
    digest = hashlib.sha256(f"{sim_id}:{salt}".encode()).digest()
    seed   = int.from_bytes(digest[:8], "big")
    return np.random.default_rng(seed)


# ── Speed profile building blocks ─────────────────────────────────────────────

def _ar1(n: int, mean: float, std: float, ar: float,
         lo: float, hi: float, rng: np.random.Generator) -> np.ndarray:
    noise_std = std * math.sqrt(max(1.0 - ar ** 2, 1e-9))
    out       = np.empty(n, dtype=np.float64)
    out[0]    = np.clip(rng.normal(mean, std), lo, hi)
    for i in range(1, n):
        out[i] = ar * out[i - 1] + (1.0 - ar) * mean + rng.normal(0.0, noise_std)
        out[i] = np.clip(out[i], lo, hi)
    return out


def _ema(series: np.ndarray, alpha: float) -> np.ndarray:
    out    = np.empty_like(series)
    out[0] = series[0]
    beta   = 1.0 - alpha
    for i in range(1, len(series)):
        out[i] = alpha * series[i] + beta * out[i - 1]
    return out


def _ramp(n: int, ramp_len: int,
          v_start: float, v_end: float, series: np.ndarray) -> np.ndarray:
    out = series.copy()
    r   = min(ramp_len, n)
    for i in range(r):
        t       = i / r
        out[i] *= t              # linear ramp up from 0
    r2 = min(ramp_len, n)
    for i in range(r2):
        t            = i / r2
        out[n - 1 - i] *= t     # linear ramp down to 0
    return np.clip(out, 0.0, None)


def _urban_profile(n: int, rng: np.random.Generator) -> np.ndarray:
    raw = _ar1(n, URBAN_MEAN_KMH, URBAN_STD_KMH, URBAN_AR, 0.0, URBAN_MAX_KMH, rng)
    i   = 0
    while i < n:
        if rng.random() < URBAN_STOP_PROB:
            stop_len = min(int(rng.integers(URBAN_STOP_MIN, URBAN_STOP_MAX + 1)), n - i)
            raw[i:i + stop_len] = 0.0
            i += stop_len
        else:
            i += 1
    smoothed = _ema(raw, URBAN_EMA_ALPHA)
    smoothed = _ramp(n, ramp_len=min(45, n // 4), v_start=0.0, v_end=0.0, series=smoothed)
    return np.clip(smoothed, 0.0, URBAN_MAX_KMH)


def _highway_profile(n: int, rng: np.random.Generator) -> np.ndarray:
    raw = _ar1(n, HWY_MEAN_KMH, HWY_STD_KMH, HWY_AR, HWY_MIN_KMH, HWY_MAX_KMH, rng)
    i   = 0
    while i < n:
        if rng.random() < HWY_SLOW_PROB:
            slow_len = min(int(rng.integers(HWY_SLOW_MIN, HWY_SLOW_MAX + 1)), n - i)
            raw[i:i + slow_len] = np.clip(
                rng.normal(40.0, 12.0, slow_len), 0.0, 70.0
            )
            i += slow_len
        else:
            i += 1
    smoothed = _ema(raw, HWY_EMA_ALPHA)
    smoothed = _ramp(n, ramp_len=min(60, n // 4), v_start=0.0, v_end=0.0, series=smoothed)
    return np.clip(smoothed, 0.0, HWY_MAX_KMH)


def build_speed_series(
    n_rows: int,
    dt_s: np.ndarray,
    gap_threshold_s: float,
    sim_id: str,
) -> np.ndarray:
    """
    Build a per-row speed array (km/h) of length n_rows, segmented by gaps.
    dt_s[i] is the elapsed seconds between row i and row i+1 (length n_rows-1).
    """
    speeds = np.zeros(n_rows, dtype=np.float64)
    if n_rows <= 1:
        return speeds

    # Locate trip boundaries: gap_mask[i] = True means a gap STARTS at row i+1
    gap_mask    = dt_s > gap_threshold_s
    trip_starts = [0] + list(np.where(gap_mask)[0] + 1)
    trip_ends   = trip_starts[1:] + [n_rows]

    mode_rng = _rng(sim_id, "modes")

    for t_idx, (t_start, t_end) in enumerate(zip(trip_starts, trip_ends)):
        t_len = t_end - t_start
        if t_len <= 0:
            continue
        t_rng  = _rng(sim_id, f"trip_{t_idx}")
        mode   = "urban" if mode_rng.random() < URBAN_TRIP_PROB else "highway"
        if mode == "urban":
            speeds[t_start:t_end] = _urban_profile(t_len, t_rng)
        else:
            speeds[t_start:t_end] = _highway_profile(t_len, t_rng)

    return speeds


# ── Odometer computation ──────────────────────────────────────────────────────

def compute_odometer(
    timestamps: pd.Series,
    base_km: float,
    gap_threshold_s: float,
    sim_id: str,
) -> np.ndarray:
    n   = len(timestamps)
    odo = np.empty(n, dtype=np.float64)
    odo[0] = base_km

    if n == 1:
        return odo

    ts_ns  = timestamps.values.astype("datetime64[ns]").astype(np.int64)
    dt_s   = np.diff(ts_ns) / 1e9
    dt_s   = np.maximum(dt_s, 0.0)

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
    dt_s        = ts.diff().dt.total_seconds().dropna()
    median_dt   = float(dt_s.median()) if not dt_s.empty else 1.0
    gap_thr     = max(GAP_MULTIPLIER * median_dt, GAP_MIN_S)
    n_gaps      = int((dt_s > gap_thr).sum())
    span_s      = (ts.iloc[-1] - ts.iloc[0]).total_seconds() if len(ts) > 1 else 0.0
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
        sim_id   = sim_dir.name
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
    dry_run = "--dry-run" in sys.argv

    print("\n== fix_mileage.py ==========================================")
    print(f"   Vehicles root : {VEHICLES_ROOT}")
    print(f"   Mode          : {'DRY RUN (no writes)' if dry_run else 'LIVE (files will be overwritten)'}")
    print("============================================================\n")

    if not dry_run and "--yes" not in sys.argv:
        confirm = input("This will overwrite all body CSVs. Continue? (y/n): ").strip().lower()
        if confirm not in ("y", "yes"):
            print("Aborted.")
            sys.exit(0)

    sims = discover_sims(VEHICLES_ROOT)
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
