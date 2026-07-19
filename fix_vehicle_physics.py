"""
fix_vehicle_physics.py
======================
Rewrites physically incoherent sensor columns in vehicle CSVs with
truck-realistic values derived from a single coherent speed backbone.

Every derived signal flows from ONE source of truth — the speed series
built deterministically from each module's own timestamps + sim_id seed.
Running on the full dataset on another device produces the same physical
relationships because the seed is the sim_id, not the machine or time.

Columns fixed per module
────────────────────────
  transmission  →  vehicle_speed_kmh
                   gear_position_actual  (integer 1-6)
                   gear_commanded_target (integer 1-6)
                   engine_rpm            (consistent with engine module)
                   engine_load_absolute_pct
                   engine_load_calculated_pct
                   torque_converter_slip_speed

  engine        →  engine_rpm_rpm
                   engine_load_absolute

  body          →  fuel_level_pct
                   (odometer_reading left to fix_mileage.py)

Vehicle type assumed
────────────────────
Medium-heavy diesel truck, Indian intercity fleet
(Delhi-Lucknow / Delhi-Jaipur corridor routes)

Usage
─────
  python fix_vehicle_physics.py              # live — prompts confirmation
  python fix_vehicle_physics.py --dry-run    # audit only, zero writes
  python fix_vehicle_physics.py --yes        # live, skip confirmation prompt
  python fix_vehicle_physics.py --root /path/to/vehicles  # override data root
"""

from __future__ import annotations

import sys
import math
import hashlib
import textwrap
from pathlib import Path

import numpy as np
import pandas as pd

# ── Root ──────────────────────────────────────────────────────────────────────

ROOT_DIR      = Path(__file__).resolve().parent.parent
VEHICLES_ROOT = ROOT_DIR / "data" / "vehicles"

# ── Gap detection (identical to fix_mileage.py) ───────────────────────────────

GAP_MULTIPLIER = 5
GAP_MIN_S      = 300      # hard floor: 5 min

# ── Truck speed profile (Indian intercity diesel fleet) ───────────────────────
#
#   Urban  : city delivery, congested NH roads, 10-48 km/h
#   Highway: expressway cruise, governed at 88 km/h

URBAN_TRIP_PROB = 0.55    # 55 % of trips classified as urban

U_MEAN    = 22.0          # mean cruise speed
U_STD     = 11.0          # std for AR1 process
U_AR      = 0.87          # autocorrelation (smooth but responsive)
U_MAX     = 48.0          # hard cap
U_STOP_P  = 0.06          # per-row probability of entering a stop (~50% time at stop)
U_STOP_MIN = 4            # min stop duration (seconds)
U_STOP_MAX = 30           # max stop duration (loading bays, traffic lights)
U_EMA     = 0.12          # EMA smoothing weight (lower = slower response)
U_RAMP    = 120           # rows to ramp speed up at trip start

H_MEAN    = 76.0
H_STD     = 6.0
H_AR      = 0.97          # very autocorrelated — trucks cruise steadily
H_MIN     = 50.0
H_MAX     = 88.0          # governed speed limit
H_SLOW_P  = 0.008         # toll plazas / speed bumps
H_SLOW_MIN = 8
H_SLOW_MAX = 25
H_EMA     = 0.04
H_RAMP    = 90            # trucks take longer to reach highway speed

# ── Gear model (6-speed diesel, sequential with hysteresis) ──────────────────
#
#   GEAR_BANDS[i] = (upshift_kmh, downshift_kmh) for gear i+1
#     upshift_kmh : speed above which the next gear is engaged
#     downshift_kmh: speed below which we drop back one gear
#
#   Hysteresis gap between upshift and downshift prevents gear hunting.

GEAR_BANDS: list[tuple[float, float]] = [
    (16.0,   0.0),   # gear 1 — upshift at 16, no downshift
    (29.0,  12.0),   # gear 2
    (47.0,  23.0),   # gear 3
    (67.0,  40.0),   # gear 4
    (83.0,  60.0),   # gear 5
    (999.0, 74.0),   # gear 6 — no upshift
]
GEAR_COUNT    = len(GEAR_BANDS)
GEAR_MIN_DWELL = 4            # minimum rows in current gear before shifting

# RPM per km/h for each gear  (diesel engine: low RPM, flat torque curve)
GEAR_RPM_K: list[float] = [65.0, 41.0, 27.0, 20.0, 16.0, 13.0]

# ── Diesel RPM constants ──────────────────────────────────────────────────────

IDLE_RPM       = 720.0
RPM_NOISE_STD  = 35.0
RPM_AR         = 0.82

# ── Engine load constants (loaded truck — higher baseline than a car) ─────────

LOAD_BASE_IDLE   = 0.15    # load fraction at zero speed (accessories, PTO)
LOAD_SPEED_COEFF = 0.45    # additional load at maximum speed
LOAD_ACCEL_K     = 25.0    # % load added per km/h/s of acceleration
LOAD_DECEL_K     = 15.0    # % load removed per km/h/s of deceleration
LOAD_NOISE_STD   = 4.0
LOAD_AR          = 0.78

# ── TC slip constants ─────────────────────────────────────────────────────────

SLIP_CRUISE_MAX  = 40.0    # RPM — stable, torque converter locked
SLIP_LOAD_SCALE  = 200.0   # RPM — maximum load-proportional slip
SLIP_SHIFT_PEAK  = 720.0   # RPM — spike immediately after a gear change
SLIP_SHIFT_DECAY = 0.55    # exponential decay per row post-shift
SLIP_NOISE_STD   = 8.0

# ── Fuel constants (200 L diesel tank, Indian truck) ──────────────────────────

FUEL_IDLE_LPH     = 2.8    # litres per hour at idle
FUEL_BASE_L100    = 12.0   # L/100 km at light load
FUEL_LOAD_L100    = 10.0   # additional L/100 km at 100 % load
FUEL_START_MIN    = 0.65   # minimum starting fuel fraction
FUEL_START_RANGE  = 0.25   # spread of starting fuel across vehicles
FUEL_REFUEL_MIN   = 0.20   # minimum refuel amount (fraction of tank)
FUEL_REFUEL_MAX   = 0.50   # maximum refuel amount
GAP_MAYBE_S       = 4  * 3600   # gaps this long: probabilistic refuel
GAP_ALWAYS_S      = 12 * 3600   # gaps this long: always refuel
REFUEL_PROB       = 0.55   # probability of refuelling at a 4-12 h gap


# ─────────────────────────────────────────────────────────────────────────────
#  UTILITY — RNG and signal building blocks (same seed logic as fix_mileage.py)
# ─────────────────────────────────────────────────────────────────────────────

def _rng(sim_id: str, salt: str = "") -> np.random.Generator:
    digest = hashlib.sha256(f"{sim_id}:{salt}".encode()).digest()
    seed   = int.from_bytes(digest[:8], "big")
    return np.random.default_rng(seed)


def _ar1(n: int, mean: float, std: float, ar: float,
         lo: float, hi: float, rng: np.random.Generator) -> np.ndarray:
    noise_std = std * math.sqrt(max(1.0 - ar ** 2, 1e-9))
    noise     = rng.normal(0.0, noise_std, n)
    out       = np.empty(n, dtype=np.float64)
    out[0]    = float(np.clip(rng.normal(mean, std), lo, hi))
    for i in range(1, n):
        out[i] = float(np.clip(ar * out[i - 1] + (1.0 - ar) * mean + noise[i], lo, hi))
    return out


def _ema(series: np.ndarray, alpha: float) -> np.ndarray:
    out    = np.empty_like(series)
    out[0] = series[0]
    beta   = 1.0 - alpha
    for i in range(1, len(series)):
        out[i] = alpha * series[i] + beta * out[i - 1]
    return out


def _ramp(n: int, ramp_len: int, series: np.ndarray) -> np.ndarray:
    out = series.copy()
    r   = min(ramp_len, n)
    for i in range(r):
        out[i] *= i / r
    for i in range(min(ramp_len, n)):
        out[n - 1 - i] *= i / ramp_len
    return np.clip(out, 0.0, None)


def _urban_profile(n: int, rng: np.random.Generator) -> np.ndarray:
    raw = _ar1(n, U_MEAN, U_STD, U_AR, 0.0, U_MAX, rng)
    i   = 0
    while i < n:
        if rng.random() < U_STOP_P:
            stop_len = min(int(rng.integers(U_STOP_MIN, U_STOP_MAX + 1)), n - i)
            raw[i:i + stop_len] = 0.0
            i += stop_len
        else:
            i += 1
    return _ramp(n, U_RAMP, np.clip(_ema(raw, U_EMA), 0.0, U_MAX))


def _highway_profile(n: int, rng: np.random.Generator) -> np.ndarray:
    raw = _ar1(n, H_MEAN, H_STD, H_AR, H_MIN, H_MAX, rng)
    i   = 0
    while i < n:
        if rng.random() < H_SLOW_P:
            slow_len = min(int(rng.integers(H_SLOW_MIN, H_SLOW_MAX + 1)), n - i)
            raw[i:i + slow_len] = np.clip(rng.normal(35.0, 10.0, slow_len), 0.0, 60.0)
            i += slow_len
        else:
            i += 1
    return _ramp(n, H_RAMP, np.clip(_ema(raw, H_EMA), 0.0, H_MAX))


def build_truck_speed(
    n_rows: int,
    dt_s: np.ndarray,
    gap_thr: float,
    sim_id: str,
) -> np.ndarray:
    """
    Build trip-aware truck speed series (km/h) for n_rows rows.
    dt_s  — elapsed seconds between consecutive rows (length n_rows-1).
    Deterministic: same sim_id + same timestamps → same output every run.
    """
    speeds    = np.zeros(n_rows, dtype=np.float64)
    if n_rows <= 1:
        return speeds

    gap_mask    = dt_s > gap_thr
    trip_starts = [0] + list(np.where(gap_mask)[0] + 1)
    trip_ends   = trip_starts[1:] + [n_rows]
    mode_rng    = _rng(sim_id, "modes")

    for t_idx, (t0, t1) in enumerate(zip(trip_starts, trip_ends)):
        t_len = t1 - t0
        if t_len <= 0:
            continue
        t_rng  = _rng(sim_id, f"trip_{t_idx}")
        mode   = "urban" if mode_rng.random() < URBAN_TRIP_PROB else "highway"
        speeds[t0:t1] = _urban_profile(t_len, t_rng) if mode == "urban" \
                        else _highway_profile(t_len, t_rng)

    return speeds


# ─────────────────────────────────────────────────────────────────────────────
#  SIGNAL DERIVATION  (all pure functions; no I/O)
# ─────────────────────────────────────────────────────────────────────────────

def derive_gear(speeds: np.ndarray) -> np.ndarray:
    """
    Sequential 6-speed gear state machine with hysteresis and minimum dwell.
    Returns integer array in [1, 6].
    """
    n     = len(speeds)
    gears = np.ones(n, dtype=np.int32)
    gear  = 1
    dwell = 0

    for i in range(n):
        s = speeds[i]

        if s < 0.5:
            gear, dwell = 1, 0
            gears[i]    = gear
            continue

        dwell += 1

        if dwell >= GEAR_MIN_DWELL:
            up_thr = GEAR_BANDS[gear - 1][0]
            dn_thr = GEAR_BANDS[gear - 1][1]
            if gear < GEAR_COUNT and s >= up_thr:
                gear  += 1
                dwell  = 0
            elif gear > 1 and s < dn_thr:
                gear  -= 1
                dwell  = 0

        gears[i] = gear

    return gears


def derive_load(speeds: np.ndarray, dt_s: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """
    Engine load (%) from speed and acceleration.
    Trucks carry weight → higher base load than cars.
    """
    n       = len(speeds)
    accel   = np.zeros(n)
    if n > 1:
        dt_safe         = np.maximum(dt_s, 0.5)
        accel[1:]       = np.diff(speeds) / dt_safe   # km/h per second

    base    = LOAD_BASE_IDLE + (speeds / H_MAX) * LOAD_SPEED_COEFF
    a_pos   = np.clip( accel, 0.0, None) * LOAD_ACCEL_K
    a_neg   = np.clip(-accel, 0.0, None) * LOAD_DECEL_K

    raw     = (base * 100.0) + a_pos - a_neg
    noise   = rng.normal(0.0, LOAD_NOISE_STD, n)

    load    = np.empty(n)
    load[0] = float(np.clip(raw[0] + noise[0], 5.0, 97.0))
    for i in range(1, n):
        load[i] = float(np.clip(
            LOAD_AR * load[i - 1] + (1 - LOAD_AR) * raw[i] + noise[i],
            5.0, 97.0,
        ))

    return load


def derive_rpm(speeds: np.ndarray, gears: np.ndarray,
               rng: np.random.Generator) -> np.ndarray:
    """
    Diesel RPM from speed and gear.  Idle at 720; governed top ~2 200 RPM.
    """
    n       = len(speeds)
    nominal = np.array([
        max(IDLE_RPM, speeds[i] * GEAR_RPM_K[gears[i] - 1])
        for i in range(n)
    ])
    noise   = rng.normal(0.0, RPM_NOISE_STD, n)
    rpm     = np.empty(n)
    rpm[0]  = float(np.clip(nominal[0] + noise[0], IDLE_RPM, 2250.0))
    for i in range(1, n):
        rpm[i] = float(np.clip(
            RPM_AR * rpm[i - 1] + (1 - RPM_AR) * nominal[i] + noise[i],
            IDLE_RPM, 2250.0,
        ))
    return rpm


def derive_tc_slip(speeds: np.ndarray, gears: np.ndarray,
                   loads: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """
    Torque-converter slip (RPM).
    Near-zero when cruising in a locked gear.
    Spikes on gear changes, proportional to load otherwise.
    """
    n           = len(speeds)
    noise       = np.abs(rng.normal(0.0, SLIP_NOISE_STD, n))
    slips       = np.zeros(n)
    shift_carry = 0.0

    for i in range(n):
        s = speeds[i]
        l = loads[i]

        # detect gear change
        if i > 0 and gears[i] != gears[i - 1]:
            shift_carry = SLIP_SHIFT_PEAK

        if s < 0.5:
            slips[i] = max(0.0, rng.normal(15.0, 8.0))
        else:
            load_frac   = l / 100.0
            cruise_slip = SLIP_CRUISE_MAX * load_frac
            load_slip   = SLIP_LOAD_SCALE * max(0.0, (load_frac - 0.40) / 0.60)
            slips[i]    = cruise_slip + load_slip + shift_carry + noise[i]

        shift_carry = max(0.0, shift_carry * SLIP_SHIFT_DECAY)
        slips[i]    = max(0.0, slips[i])

    return slips


def derive_fuel(
    speeds: np.ndarray,
    loads: np.ndarray,
    dt_s: np.ndarray,
    gap_thr: float,
    sim_id: str,
    rng: np.random.Generator,
) -> tuple[np.ndarray, int]:
    """
    Fuel level (%) with probabilistic refuelling at long trip gaps.
    Within-trip the fuel decreases monotonically; refuels add discrete steps up.
    Returns (fuel_array, n_refuels).
    """
    n        = len(speeds)
    fuel     = np.empty(n)
    start    = FUEL_START_MIN + float(_rng(sim_id, "fuel_start").random()) * FUEL_START_RANGE
    current  = start * 100.0
    fuel[0]  = current
    n_refuels = 0

    refuel_rng = _rng(sim_id, "fuel_refuel")

    for i in range(1, n):
        dt = dt_s[i - 1]

        if dt > gap_thr:
            if dt >= GAP_ALWAYS_S:
                fill     = (FUEL_REFUEL_MIN + refuel_rng.random() * FUEL_REFUEL_MAX)
                current  = min(100.0, current + fill * 100.0)
                n_refuels += 1
            elif dt >= GAP_MAYBE_S and refuel_rng.random() < REFUEL_PROB:
                fill     = (FUEL_REFUEL_MIN + refuel_rng.random() * (FUEL_REFUEL_MAX - FUEL_REFUEL_MIN))
                current  = min(100.0, current + fill * 100.0)
                n_refuels += 1
            fuel[i] = current
            continue

        s = speeds[i]
        l = loads[i] / 100.0

        if s < 0.5:
            consumed_l = FUEL_IDLE_LPH * (dt / 3600.0)
        else:
            rate_l100  = FUEL_BASE_L100 + l * FUEL_LOAD_L100
            dist_km    = s * (dt / 3600.0)
            consumed_l = rate_l100 * dist_km / 100.0

        consumed_pct = (consumed_l / 200.0) * 100.0
        current      = max(2.0, current - consumed_pct)
        fuel[i]      = current

    return fuel, n_refuels


# ─────────────────────────────────────────────────────────────────────────────
#  TIMESTAMP ANALYSIS
# ─────────────────────────────────────────────────────────────────────────────

def analyse_timestamps(ts: pd.Series) -> dict:
    dt_s      = ts.diff().dt.total_seconds().dropna()
    median_dt = float(dt_s.median()) if not dt_s.empty else 1.0
    gap_thr   = max(GAP_MULTIPLIER * median_dt, GAP_MIN_S)
    gaps      = dt_s[dt_s > gap_thr]
    span_s    = (ts.iloc[-1] - ts.iloc[0]).total_seconds() if len(ts) > 1 else 0.0
    return {
        "rows":      len(ts),
        "median_dt": round(median_dt, 2),
        "gap_thr":   round(gap_thr, 1),
        "n_gaps":    int(len(gaps)),
        "n_trips":   int(len(gaps)) + 1,
        "span_h":    round(span_s / 3600.0, 2),
    }


# ─────────────────────────────────────────────────────────────────────────────
#  FILE DISCOVERY
# ─────────────────────────────────────────────────────────────────────────────

MODULE_PATTERNS = {
    "transmission": "*transmission*scenarioA*.csv",
    "engine":       "*engine*scenarioA*.csv",
    "body":         "*body*scenarioA*.csv",
}
MODULE_PATTERNS_FALLBACK = {
    "transmission": "*transmission*.csv",
    "engine":       "*engine*.csv",
    "body":         "*body*.csv",
}

def find_module_csv(sim_dir: Path, module: str) -> Path | None:
    hits = sorted(sim_dir.glob(MODULE_PATTERNS[module]))
    if not hits:
        hits = sorted(sim_dir.glob(MODULE_PATTERNS_FALLBACK[module]))
    return hits[0] if hits else None


def discover_sims(root: Path) -> list[tuple[str, Path]]:
    sims = []
    if not root.exists():
        print(f"[ERROR] Vehicles root not found: {root}")
        return sims
    for sim_dir in sorted(d for d in root.iterdir() if d.is_dir()):
        # include sim if at least one target module CSV exists
        has_any = any(find_module_csv(sim_dir, m) for m in MODULE_PATTERNS)
        if has_any:
            sims.append((sim_dir.name, sim_dir))
        else:
            print(f"  [WARN] {sim_dir.name}: no target CSVs found — skipped")
    return sims


# ─────────────────────────────────────────────────────────────────────────────
#  PER-MODULE FIX FUNCTIONS
# ─────────────────────────────────────────────────────────────────────────────

def _load_timestamps(df: pd.DataFrame, csv_path: Path) -> pd.Series | None:
    if "timestamp" not in df.columns:
        print(f"    [ERROR] No 'timestamp' column in {csv_path.name} — skipped")
        return None
    ts = pd.to_datetime(df["timestamp"], utc=True, errors="coerce")
    bad = ts.isna().sum()
    if bad:
        print(f"    [WARN]  Dropping {bad} rows with unparseable timestamps")
    return ts


def _write_back(df: pd.DataFrame, original_cols: list, csv_path: Path) -> None:
    df["timestamp"] = df["_ts"].dt.strftime("%Y-%m-%d %H:%M:%S+00:00")
    df[original_cols].to_csv(csv_path, index=False)


# ── Transmission ──────────────────────────────────────────────────────────────

_TRANS_COLS = {
    "vehicle_speed_kmh":         "speed",
    "gear_position_actual":      "gear",
    "gear_commanded_target":     "gear",
    "engine_rpm":                "rpm",
    "engine_load_absolute_pct":  "load",
    "engine_load_calculated_pct":"load",
    "torque_converter_slip_speed":"slip",
}

def fix_transmission(sim_id: str, csv_path: Path, dry_run: bool) -> dict:
    print(f"  [TRANSMISSION]  {csv_path.name}")
    df   = pd.read_csv(csv_path, low_memory=False)
    orig = list(df.columns)

    ts = _load_timestamps(df, csv_path)
    if ts is None:
        return {}
    df["_ts"] = ts
    df = df.dropna(subset=["_ts"]).sort_values("_ts").reset_index(drop=True)

    info  = analyse_timestamps(df["_ts"])
    n     = info["rows"]
    ts_ns = df["_ts"].values.astype("datetime64[ns]").astype(np.int64)
    dt_s  = np.maximum(np.diff(ts_ns) / 1e9, 0.0)

    gap   = info["gap_thr"]
    speed = build_truck_speed(n, dt_s, gap, sim_id)
    gears = derive_gear(speed)
    load  = derive_load(speed, dt_s, _rng(sim_id, "load_trans"))
    rpm   = derive_rpm(speed, gears, _rng(sim_id, "rpm_trans"))
    slip  = derive_tc_slip(speed, gears, load, _rng(sim_id, "slip"))

    derived = {"speed": speed, "gear": gears.astype(float),
               "rpm": rpm, "load": load, "slip": slip}

    present   = {col: key for col, key in _TRANS_COLS.items() if col in df.columns}
    not_found = [col for col in _TRANS_COLS if col not in df.columns]
    if not_found:
        print(f"    [INFO] Columns not in CSV (skipped): {not_found}")

    stats = {
        "rows":   n, "trips": info["n_trips"],
        "speed":  f"{speed.min():.0f}-{speed.max():.0f} km/h (avg={speed.mean():.0f})",
        "gear":   {int(g): int((gears == g).sum()) for g in range(1, 7)},
        "rpm":    f"{rpm.min():.0f}-{rpm.max():.0f}",
        "load":   f"{load.min():.1f}-{load.max():.1f}%",
        "slip":   f"{slip.min():.0f}-{slip.max():.0f} RPM",
    }

    if dry_run:
        return stats

    for col, key in present.items():
        df[col] = derived[key]

    _write_back(df, orig, csv_path)
    return stats


# ── Engine ────────────────────────────────────────────────────────────────────

_ENGINE_COLS = {
    "engine_rpm_rpm":      "rpm",
    "engine_load_absolute":"load",
}

def fix_engine(sim_id: str, csv_path: Path, dry_run: bool) -> dict:
    print(f"  [ENGINE]        {csv_path.name}")
    df   = pd.read_csv(csv_path, low_memory=False)
    orig = list(df.columns)

    ts = _load_timestamps(df, csv_path)
    if ts is None:
        return {}
    df["_ts"] = ts
    df = df.dropna(subset=["_ts"]).sort_values("_ts").reset_index(drop=True)

    info  = analyse_timestamps(df["_ts"])
    n     = info["rows"]
    ts_ns = df["_ts"].values.astype("datetime64[ns]").astype(np.int64)
    dt_s  = np.maximum(np.diff(ts_ns) / 1e9, 0.0)

    gap   = info["gap_thr"]
    speed = build_truck_speed(n, dt_s, gap, sim_id)
    gears = derive_gear(speed)
    load  = derive_load(speed, dt_s, _rng(sim_id, "load_eng"))
    rpm   = derive_rpm(speed, gears, _rng(sim_id, "rpm_eng"))

    derived  = {"rpm": rpm, "load": load}
    present  = {col: key for col, key in _ENGINE_COLS.items() if col in df.columns}
    not_found = [col for col in _ENGINE_COLS if col not in df.columns]
    if not_found:
        print(f"    [INFO] Columns not in CSV (skipped): {not_found}")

    stats = {
        "rows":  n, "trips": info["n_trips"],
        "speed": f"{speed.min():.0f}-{speed.max():.0f} km/h (avg={speed.mean():.0f})",
        "rpm":   f"{rpm.min():.0f}-{rpm.max():.0f}",
        "load":  f"{load.min():.1f}-{load.max():.1f}%",
    }

    if dry_run:
        return stats

    for col, key in present.items():
        df[col] = derived[key]

    _write_back(df, orig, csv_path)
    return stats


# ── Body ──────────────────────────────────────────────────────────────────────

def fix_body(sim_id: str, csv_path: Path, dry_run: bool) -> dict:
    print(f"  [BODY]          {csv_path.name}")
    df   = pd.read_csv(csv_path, low_memory=False)
    orig = list(df.columns)

    if "fuel_level_pct" not in df.columns:
        print(f"    [ERROR] 'fuel_level_pct' not found — skipped")
        return {}

    ts = _load_timestamps(df, csv_path)
    if ts is None:
        return {}
    df["_ts"] = ts
    df = df.dropna(subset=["_ts"]).sort_values("_ts").reset_index(drop=True)

    info  = analyse_timestamps(df["_ts"])
    n     = info["rows"]
    ts_ns = df["_ts"].values.astype("datetime64[ns]").astype(np.int64)
    dt_s  = np.maximum(np.diff(ts_ns) / 1e9, 0.0)

    gap   = info["gap_thr"]
    speed = build_truck_speed(n, dt_s, gap, sim_id)
    gears = derive_gear(speed)
    load  = derive_load(speed, dt_s, _rng(sim_id, "load_body"))
    fuel, n_refuels = derive_fuel(speed, load, dt_s, gap, sim_id, _rng(sim_id, "fuel_noise"))

    stats = {
        "rows":        n, "trips": info["n_trips"],
        "speed":       f"{speed.min():.0f}-{speed.max():.0f} km/h (avg={speed.mean():.0f})",
        "fuel_start":  f"{fuel[0]:.1f}%",
        "fuel_end":    f"{fuel[-1]:.1f}%",
        "fuel_range":  f"{fuel.min():.1f}-{fuel.max():.1f}%",
        "n_refuels":   n_refuels,
    }

    if dry_run:
        return stats

    df["fuel_level_pct"] = np.round(fuel, 3)
    _write_back(df, orig, csv_path)
    return stats


# ─────────────────────────────────────────────────────────────────────────────
#  PER-SIM ORCHESTRATOR
# ─────────────────────────────────────────────────────────────────────────────

FIXERS = {
    "transmission": fix_transmission,
    "engine":       fix_engine,
    "body":         fix_body,
}

def fix_sim(sim_id: str, sim_dir: Path, dry_run: bool) -> dict:
    print(f"\n{'=' * 68}")
    print(f"  SIM: {sim_id}  |  {'DRY RUN' if dry_run else 'LIVE WRITE'}")
    print(f"{'=' * 68}")

    results = {}
    for module, fixer in FIXERS.items():
        csv = find_module_csv(sim_dir, module)
        if csv is None:
            print(f"  [{module.upper():14s}] CSV not found — skipped")
            continue
        try:
            r = fixer(sim_id, csv, dry_run)
            results[module] = r
        except Exception as exc:
            import traceback
            print(f"  [{module.upper():14s}] ERROR: {exc}")
            traceback.print_exc()

    return results


# ─────────────────────────────────────────────────────────────────────────────
#  REPORTING
# ─────────────────────────────────────────────────────────────────────────────

def _print_summary(all_results: dict, dry_run: bool) -> None:
    print("\n\n" + "=" * 68)
    print("  SUMMARY" + ("  (DRY RUN - no files written)" if dry_run else ""))
    print("=" * 68)

    for sim_id, mod_results in all_results.items():
        print(f"\n  {sim_id}")
        for module, r in mod_results.items():
            if not r:
                print(f"    {module:16s} -> SKIPPED")
                continue
            rows  = r.get("rows", "?")
            trips = r.get("trips", "?")
            print(f"    {module:16s} -> {rows:>7,} rows  {trips} trips")
            if "speed" in r:
                print(f"      speed : {r['speed']}")
            if "gear" in r:
                g = r["gear"]
                bar = "  ".join(f"G{k}={v:>5}" for k, v in g.items())
                print(f"      gears : {bar}")
            if "rpm" in r:
                print(f"      rpm   : {r['rpm']}")
            if "load" in r:
                print(f"      load  : {r['load']}")
            if "slip" in r:
                print(f"      slip  : {r['slip']}")
            if "fuel_start" in r:
                print(f"      fuel  : {r['fuel_start']} -> {r['fuel_end']}  "
                      f"range={r['fuel_range']}  refuels={r.get('n_refuels', '?')}")

    print("\n" + "=" * 68 + "\n")


# ─────────────────────────────────────────────────────────────────────────────
#  ENTRY POINT
# ─────────────────────────────────────────────────────────────────────────────

def main() -> None:
    args    = sys.argv[1:]
    dry_run = "--dry-run" in args
    skip_ok = "--yes"     in args

    # optional --root override (for running on another device)
    root = VEHICLES_ROOT
    if "--root" in args:
        idx = args.index("--root")
        if idx + 1 < len(args):
            root = Path(args[idx + 1])
        else:
            print("[ERROR] --root requires a path argument")
            sys.exit(1)

    print("=" * 68)
    print("  fix_vehicle_physics.py  --  Truck-realistic sensor coherence fix")
    print("=" * 68)
    print(f"  Vehicles root : {root}")
    print(f"  Mode          : {'DRY RUN (no writes)' if dry_run else 'LIVE  (files will be overwritten)'}")
    print("=" * 68)

    print(textwrap.dedent("""
    Modules / columns to fix
    -------------------------
      transmission -> vehicle_speed_kmh, gear_position_actual,
                      gear_commanded_target, engine_rpm,
                      engine_load_absolute_pct, engine_load_calculated_pct,
                      torque_converter_slip_speed
      engine       -> engine_rpm_rpm, engine_load_absolute
      body         -> fuel_level_pct
    """))

    if not dry_run and not skip_ok:
        ans = input("This will overwrite target columns in all CSVs. Continue? (y/n): ").strip().lower()
        if ans not in ("y", "yes"):
            print("Aborted.")
            sys.exit(0)

    sims = discover_sims(root)
    if not sims:
        print("[ERROR] No sim directories found.")
        sys.exit(1)

    print(f"\nFound {len(sims)} sim(s): {[s for s, _ in sims]}\n")

    all_results: dict = {}
    for sim_id, sim_dir in sims:
        try:
            all_results[sim_id] = fix_sim(sim_id, sim_dir, dry_run)
        except Exception as exc:
            import traceback
            print(f"\n[ERROR] {sim_id} failed: {exc}")
            traceback.print_exc()

    _print_summary(all_results, dry_run)


if __name__ == "__main__":
    main()
