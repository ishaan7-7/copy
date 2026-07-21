import sys
import math
import hashlib
import numpy as np
import pandas as pd
from pathlib import Path

ROOT_DIR      = Path(__file__).resolve().parent.parent
VEHICLES_ROOT = ROOT_DIR / "data" / "vehicles"

# ── Gap detection ─────────────────────────────────────────────────────────────

GAP_MULTIPLIER = 5
GAP_MIN_S      = 300

# ── Speed model (same AR1 + EMA as fix_vehicle_physics.py) ───────────────────

URBAN_TRIP_PROB = 0.55
U_MEAN     = 22.0;  U_STD  = 11.0; U_AR  = 0.87; U_MAX  = 48.0
U_STOP_P   = 0.06;  U_STOP_MAX = 30
U_EMA      = 0.12
H_MEAN     = 76.0;  H_STD  = 6.0;  H_AR  = 0.97
H_MIN      = 50.0;  H_MAX  = 88.0
H_SLOW_P   = 0.008; H_SLOW_MIN = 8; H_SLOW_MAX = 25
H_EMA      = 0.04

# ── Tyre pressure — diesel truck medium-heavy 10-14t GVW ─────────────────────

PRESS_FRONT_NOM = 90.0    # PSI cold nominal, steer axle (10.00R20 / 295-80R22.5)
PRESS_REAR_NOM  = 105.0   # PSI cold nominal, drive axle
PRESS_INIT_STD  = 4.5     # across-sim variation
PRESS_TYRE_STD  = 1.8     # L/R imbalance within the same axle
PRESS_NOISE_STD = 0.28    # row-level measurement noise (PSI)
PRESS_TEMP_K    = 0.22    # PSI per degC above cold reference
PRESS_COLD_REF  = 35.0    # ambient reference temp for cold inflation (degC)

# ── Tyre temperature — FL and FR only (RL/RR derived in backend) ─────────────

TEMP_AMBIENT_MIN   = 34.0   # degC
TEMP_AMBIENT_RANGE = 8.0
TEMP_DELTA_IDLE    = 4.0    # above ambient at standstill
TEMP_DELTA_HWY     = 28.0   # above ambient at HWY_REF km/h
TEMP_HWY_REF       = 80.0   # reference highway speed
TEMP_TAU_S         = 900.0  # 15-min thermal time constant
TEMP_MEAS_NOISE    = 0.12   # measurement noise (degC)
TEMP_TYRE_OFFSET   = 1.5    # std of FL vs FR random offset

# ── Tyre wear ─────────────────────────────────────────────────────────────────

WEAR_FRONT_INIT_MIN = 68.0  # % starting wear, steer axle
WEAR_FRONT_INIT_MAX = 97.0
WEAR_REAR_INIT_MIN  = 65.0  # % starting wear, drive axle (carries more load)
WEAR_REAR_INIT_MAX  = 96.0
WEAR_PER_KM_F  = 0.0035    # % per km, steer axle
WEAR_PER_KM_R  = 0.0028    # % per km, drive axle
WEAR_NOISE_STD = 0.04      # row-level noise (%)
WEAR_FLOOR     = 15.0      # minimum wear before forced replacement

# ── Columns this script fixes ─────────────────────────────────────────────────

_TARGET_COLS = {
    "tyre_pressure_fl_psi": ("pressure", "front", "fl"),
    "tyre_pressure_fr_psi": ("pressure", "front", "fr"),
    "tyre_pressure_rl_psi": ("pressure", "rear",  "rl"),
    "tyre_pressure_rr_psi": ("pressure", "rear",  "rr"),
    "tyre_temp_fl_c":       ("temp",     "front", "fl"),
    "tyre_temp_fr_c":       ("temp",     "front", "fr"),
    "tyre_wear_fl_pct":     ("wear",     "front", "fl"),
    "tyre_wear_fr_pct":     ("wear",     "front", "fr"),
    "tyre_wear_rl_pct":     ("wear",     "rear",  "rl"),
    "tyre_wear_rr_pct":     ("wear",     "rear",  "rr"),
}


# ── RNG ───────────────────────────────────────────────────────────────────────

def _rng(sim_id: str, salt: str = "") -> np.random.Generator:
    digest = hashlib.sha256(f"{sim_id}:{salt}".encode()).digest()
    return np.random.default_rng(int.from_bytes(digest[:8], "big"))


# ── Speed model helpers ───────────────────────────────────────────────────────

def _ar1(n, mean, std, ar, lo, hi, rng):
    noise_std = std * math.sqrt(max(1.0 - ar ** 2, 1e-9))
    out = np.empty(n, dtype=np.float64)
    out[0] = np.clip(rng.normal(mean, std), lo, hi)
    for i in range(1, n):
        out[i] = np.clip(ar * out[i - 1] + (1.0 - ar) * mean + rng.normal(0, noise_std), lo, hi)
    return out


def _ema(series, alpha):
    out = np.empty_like(series)
    out[0] = series[0]
    b = 1.0 - alpha
    for i in range(1, len(series)):
        out[i] = alpha * series[i] + b * out[i - 1]
    return out


def _ramp(series, ramp_len):
    out = series.copy()
    r = min(ramp_len, len(series))
    for i in range(r):
        t = i / r
        out[i] *= t
        out[len(series) - 1 - i] *= t
    return np.clip(out, 0.0, None)


def _urban_profile(n, rng):
    raw = _ar1(n, U_MEAN, U_STD, U_AR, 0.0, U_MAX, rng)
    i = 0
    while i < n:
        if rng.random() < U_STOP_P:
            stop_len = min(int(rng.integers(4, U_STOP_MAX + 1)), n - i)
            raw[i:i + stop_len] = 0.0
            i += stop_len
        else:
            i += 1
    return np.clip(_ramp(_ema(raw, U_EMA), min(45, n // 4)), 0.0, U_MAX)


def _highway_profile(n, rng):
    raw = _ar1(n, H_MEAN, H_STD, H_AR, H_MIN, H_MAX, rng)
    i = 0
    while i < n:
        if rng.random() < H_SLOW_P:
            sl = min(int(rng.integers(H_SLOW_MIN, H_SLOW_MAX + 1)), n - i)
            raw[i:i + sl] = np.clip(rng.normal(40.0, 12.0, sl), 0.0, 70.0)
            i += sl
        else:
            i += 1
    return np.clip(_ramp(_ema(raw, H_EMA), min(60, n // 4)), 0.0, H_MAX)


def build_truck_speed(n_rows, dt_s, gap_thr, sim_id):
    speeds = np.zeros(n_rows, dtype=np.float64)
    if n_rows <= 1:
        return speeds
    gap_mask   = dt_s > gap_thr
    trip_starts = [0] + list(np.where(gap_mask)[0] + 1)
    trip_ends   = trip_starts[1:] + [n_rows]
    mode_rng    = _rng(sim_id, "modes")
    for t_idx, (ts, te) in enumerate(zip(trip_starts, trip_ends)):
        t_len = te - ts
        if t_len <= 0:
            continue
        t_rng = _rng(sim_id, f"trip_{t_idx}")
        if mode_rng.random() < URBAN_TRIP_PROB:
            speeds[ts:te] = _urban_profile(t_len, t_rng)
        else:
            speeds[ts:te] = _highway_profile(t_len, t_rng)
    return speeds


# ── Physics derivations ───────────────────────────────────────────────────────

def derive_temp(speeds, dt_s, gap_thr, sim_id, tyre_key):
    rng = _rng(sim_id, f"tyre_temp_{tyre_key}")
    n   = len(speeds)
    t_ambient    = TEMP_AMBIENT_MIN + rng.random() * TEMP_AMBIENT_RANGE
    tyre_offset  = rng.normal(0.0, TEMP_TYRE_OFFSET)
    meas_noise   = rng.normal(0.0, TEMP_MEAS_NOISE, n)

    temp  = np.empty(n, dtype=np.float64)
    t_cur = t_ambient + TEMP_DELTA_IDLE + tyre_offset

    for i in range(n):
        if i > 0 and dt_s[i - 1] > gap_thr:
            t_cur = t_ambient + 2.0 + tyre_offset

        dt = dt_s[i - 1] if i > 0 else 1.0
        v_frac   = min(speeds[i] / TEMP_HWY_REF, 1.0)
        t_target = t_ambient + TEMP_DELTA_IDLE + (TEMP_DELTA_HWY - TEMP_DELTA_IDLE) * v_frac + tyre_offset
        t_cur   += (t_target - t_cur) * (dt / TEMP_TAU_S)
        temp[i]  = t_cur + meas_noise[i]

    lo = t_ambient - 3.0
    hi = t_ambient + TEMP_DELTA_HWY + 6.0
    return np.clip(temp, lo, hi)


def derive_pressure(temp_arr, sim_id, axle, tyre_key):
    nom  = PRESS_FRONT_NOM if axle == "front" else PRESS_REAR_NOM
    rng  = _rng(sim_id, f"tyre_press_{axle}")
    rng2 = _rng(sim_id, f"tyre_press_{tyre_key}")

    sim_offset  = float(np.clip(rng.normal(0.0, PRESS_INIT_STD), -10.0, 8.0))
    tyre_offset = float(np.clip(rng2.normal(0.0, PRESS_TYRE_STD), -4.0, 4.0))
    press_cold  = nom + sim_offset + tyre_offset

    temp_correction = (temp_arr - PRESS_COLD_REF) * PRESS_TEMP_K
    noise           = rng.normal(0.0, PRESS_NOISE_STD, len(temp_arr))
    press           = press_cold + temp_correction + noise

    lo = nom - 12.0
    hi = nom + 15.0
    return np.clip(press, lo, hi)


def derive_wear(speeds, dt_s, gap_thr, sim_id, axle, tyre_key):
    rng = _rng(sim_id, f"tyre_wear_{tyre_key}")
    n   = len(speeds)

    if axle == "front":
        initial = WEAR_FRONT_INIT_MIN + rng.random() * (WEAR_FRONT_INIT_MAX - WEAR_FRONT_INIT_MIN)
        rate    = WEAR_PER_KM_F
    else:
        initial = WEAR_REAR_INIT_MIN  + rng.random() * (WEAR_REAR_INIT_MAX  - WEAR_REAR_INIT_MIN)
        rate    = WEAR_PER_KM_R

    dt_gap_zeroed  = np.where(dt_s > gap_thr, 0.0, dt_s)
    dt_full        = np.append(dt_gap_zeroed, 0.0)
    km_per_row     = speeds * dt_full / 3600.0
    cum_km         = np.cumsum(km_per_row)

    noise = rng.normal(0.0, WEAR_NOISE_STD, n)
    wear  = initial - rate * cum_km + noise
    return np.clip(wear, WEAR_FLOOR, 100.0)


# ── CSV fix ───────────────────────────────────────────────────────────────────

def _write_back(df, original_cols, csv_path):
    df["timestamp"] = df["_ts"].dt.strftime("%Y-%m-%d %H:%M:%S+00:00")
    df[original_cols].to_csv(csv_path, index=False)


def fix_tyre(sim_id: str, csv_path: Path, dry_run: bool) -> dict:
    print(f"\n{'=' * 62}")
    print(f"  SIM: {sim_id}   FILE: {csv_path.name}")
    print(f"{'=' * 62}")

    df = pd.read_csv(csv_path, low_memory=False)
    original_cols = list(df.columns)

    if "timestamp" not in df.columns:
        print("  [ERROR] No timestamp column — skipped")
        return {}

    df["_ts"] = pd.to_datetime(df["timestamp"], utc=True, errors="coerce")
    n_nat = df["_ts"].isna().sum()
    if n_nat:
        print(f"  [WARN]  Dropping {n_nat} unparseable timestamp rows")
    df = df.dropna(subset=["_ts"]).sort_values("_ts").reset_index(drop=True)
    n  = len(df)

    ts_ns  = df["_ts"].values.astype("datetime64[ns]").astype(np.int64)
    dt_s   = np.maximum(np.diff(ts_ns) / 1e9, 0.0)
    med_dt = float(np.median(dt_s)) if len(dt_s) > 0 else 1.0
    gap_thr = max(GAP_MULTIPLIER * med_dt, GAP_MIN_S)

    print(f"  Rows          : {n:,}")
    print(f"  Median dt     : {med_dt:.2f} s")
    print(f"  Gap threshold : {gap_thr:.0f} s")

    present = [col for col in _TARGET_COLS if col in df.columns]
    skipped = [col for col in _TARGET_COLS if col not in df.columns]
    if skipped:
        print(f"  [WARN]  Missing cols (skip): {skipped}")

    speed = build_truck_speed(n, dt_s, gap_thr, sim_id)

    temp_fl = derive_temp(speed, dt_s, gap_thr, sim_id, "fl")
    temp_fr = derive_temp(speed, dt_s, gap_thr, sim_id, "fr")

    temp_rl_proxy = temp_fl + 6.3
    temp_rr_proxy = temp_fr + 5.8

    derived = {
        "tyre_pressure_fl_psi": derive_pressure(temp_fl,       sim_id, "front", "fl"),
        "tyre_pressure_fr_psi": derive_pressure(temp_fr,       sim_id, "front", "fr"),
        "tyre_pressure_rl_psi": derive_pressure(temp_rl_proxy, sim_id, "rear",  "rl"),
        "tyre_pressure_rr_psi": derive_pressure(temp_rr_proxy, sim_id, "rear",  "rr"),
        "tyre_temp_fl_c":       temp_fl,
        "tyre_temp_fr_c":       temp_fr,
        "tyre_wear_fl_pct":     derive_wear(speed, dt_s, gap_thr, sim_id, "front", "fl"),
        "tyre_wear_fr_pct":     derive_wear(speed, dt_s, gap_thr, sim_id, "front", "fr"),
        "tyre_wear_rl_pct":     derive_wear(speed, dt_s, gap_thr, sim_id, "rear",  "rl"),
        "tyre_wear_rr_pct":     derive_wear(speed, dt_s, gap_thr, sim_id, "rear",  "rr"),
    }

    summary_rows = []
    for col in present:
        arr  = np.round(derived[col], 3)
        lo   = float(arr.min())
        hi   = float(arr.max())
        avg  = float(arr.mean())
        df[col] = arr
        summary_rows.append((col, lo, avg, hi))

    print(f"\n  {'Column':<32}  {'Min':>8}  {'Avg':>8}  {'Max':>8}")
    print(f"  {'-' * 32}  {'-' * 8}  {'-' * 8}  {'-' * 8}")
    for col, lo, avg, hi in summary_rows:
        print(f"  {col:<32}  {lo:>8.2f}  {avg:>8.2f}  {hi:>8.2f}")

    if dry_run:
        print("\n  [DRY RUN] No file written.")
        return {"rows": n, "updated": len(present)}

    _write_back(df, original_cols, csv_path)
    print(f"\n  [DONE] Written -> {csv_path}")
    return {"rows": n, "updated": len(present)}


# ── Discovery ─────────────────────────────────────────────────────────────────

def discover_sims(root: Path) -> list:
    sims = []
    for sim_dir in sorted(root.iterdir()):
        if not sim_dir.is_dir():
            continue
        sim_id = sim_dir.name
        candidates = sorted(sim_dir.glob("*tyre*scenarioA*.csv"))
        if not candidates:
            candidates = sorted(sim_dir.glob("*tyre*.csv"))
        if candidates:
            sims.append((sim_id, candidates[0]))
        else:
            print(f"  [WARN] {sim_id}: no tyre CSV found — skipped")
    return sims


# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    dry_run  = "--dry-run" in sys.argv
    yes      = "--yes"     in sys.argv
    root_arg = next((sys.argv[i + 1] for i, a in enumerate(sys.argv) if a == "--root"), None)
    root     = Path(root_arg) if root_arg else VEHICLES_ROOT

    print("\n== fix_tyre_physics.py =====================================")
    print(f"   Vehicles root : {root}")
    print(f"   Mode          : {'DRY RUN' if dry_run else 'LIVE'}")
    print("============================================================\n")

    if not dry_run and not yes:
        if input("Overwrite all tyre CSVs? (y/n): ").strip().lower() not in ("y", "yes"):
            print("Aborted.")
            sys.exit(0)

    sims = discover_sims(root)
    if not sims:
        print("[ERROR] No sims found.")
        sys.exit(1)

    print(f"Found {len(sims)} sim(s): {[s for s, _ in sims]}\n")

    results = {}
    for sim_id, csv_path in sims:
        try:
            results[sim_id] = fix_tyre(sim_id, csv_path, dry_run)
        except Exception as exc:
            import traceback
            print(f"\n  [ERROR] {sim_id}: {exc}")
            traceback.print_exc()

    print("\n\n== Summary =================================================")
    hdr = f"{'Sim':<10} {'Rows':>8} {'Cols updated':>13}"
    print(hdr)
    print("-" * len(hdr))
    for sim_id, r in results.items():
        if not r:
            print(f"{sim_id:<10}  (skipped)")
        else:
            print(f"{sim_id:<10} {r['rows']:>8,} {r['updated']:>13}")
    print("============================================================\n")


if __name__ == "__main__":
    main()
