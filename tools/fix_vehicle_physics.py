"""
fix_vehicle_physics.py
======================
Rewrites physically incoherent sensor columns in vehicle CSVs with
truck-realistic values derived from a single coherent speed backbone.

Speed backbone redesign for 1-second resolution data
─────────────────────────────────────────────────────
Original AR1 approach assumed coarser row intervals (~5-30 s). At 1 Hz the
AR1 time constant of 7 s produced speed that changed every 7 seconds with
±5 km/h jumps — no visible cruise/stop/accelerate phases.

New approach: explicit behavioral state machine per trip segment.
  Urban:   RAMP_UP → CRUISE → DECEL → STOP → repeat
  Highway: RAMP_UP → CRUISE → (occasional SLOWDOWN) → CRUISE → …
Each phase has a minimum duration tuned to 1-second resolution so timelines
show recognisable truck driving behaviour.

Columns fixed per module
────────────────────────
  transmission  →  vehicle_speed_kmh
                   gear_position_actual  (integer 1-6)
                   gear_commanded_target (integer 1-6)
                   engine_rpm
                   engine_load_absolute_pct
                   engine_load_calculated_pct
                   torque_converter_slip_speed

  engine        →  engine_rpm_rpm
                   engine_load_absolute

  body          →  fuel_level_pct

Usage
─────
  python fix_vehicle_physics.py              # live — prompts confirmation
  python fix_vehicle_physics.py --dry-run    # audit only, zero writes
  python fix_vehicle_physics.py --yes        # live, skip confirmation prompt
  python fix_vehicle_physics.py --root /path # override data root
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

# ── Gap detection ─────────────────────────────────────────────────────────────

GAP_MULTIPLIER = 5
GAP_MIN_S      = 300

# ── Trip mode split ───────────────────────────────────────────────────────────

URBAN_TRIP_PROB = 0.55

# ── Urban state machine constants (1 Hz tuned) ────────────────────────────────

U_TARGET_MIN   = 16.0      # minimum cruise target speed (km/h)
U_TARGET_MAX   = 36.0      # maximum cruise target speed
U_MAX          = 48.0      # hard speed ceiling

U_CRUISE_AR    = 0.997     # AR coefficient within cruise (τ ≈ 333 s)
U_CRUISE_STD   = 2.0       # marginal speed std during cruise (km/h)
U_CRUISE_MIN_S = 45        # min cruise phase duration (rows)
U_CRUISE_MAX_S = 240       # max cruise phase duration

U_RAMP_MIN_S   = 10        # min ramp-up rows from 0 to cruise target
U_RAMP_MAX_S   = 25        # max ramp-up rows

U_DECEL_MIN_S  = 8         # min deceleration rows to zero
U_DECEL_MAX_S  = 20        # max deceleration rows

U_STOP_MIN_S   = 30        # min stop duration (traffic light, loading)
U_STOP_MAX_S   = 120       # max stop duration

# ── Highway state machine constants (1 Hz tuned) ──────────────────────────────

H_TARGET_MIN   = 72.0      # minimum highway cruise target (km/h)
H_TARGET_MAX   = 84.0      # maximum highway cruise target
H_MAX          = 88.0      # governed speed ceiling

H_CRUISE_AR    = 0.9985    # AR coefficient within cruise (τ ≈ 666 s)
H_CRUISE_STD   = 1.5       # marginal speed std during cruise
H_CRUISE_MIN_S = 180       # min cruise phase duration (3 min)
H_CRUISE_MAX_S = 900       # max cruise phase duration (15 min)

H_RAMP_MIN_S   = 60        # min ramp-up rows to highway speed
H_RAMP_MAX_S   = 120       # max ramp-up rows

H_SLOW_MIN_V   = 10.0      # minimum slowdown target (km/h)
H_SLOW_MAX_V   = 35.0      # maximum slowdown target
H_SLOW_DECEL   = (30, 61)  # (min, max+1) rows to decelerate into slowdown
H_SLOW_DWELL   = (15, 61)  # (min, max+1) rows at slow speed
H_SLOW_ACCEL   = (30, 91)  # (min, max+1) rows to accelerate back to cruise
H_SLOW_PROB    = 0.25      # probability of slowdown after each cruise block
H_SLOW_REM_MIN = 120       # min remaining rows to trigger a slowdown

# ── Gear model ────────────────────────────────────────────────────────────────

GEAR_BANDS: list[tuple[float, float]] = [
    (16.0,   0.0),
    (29.0,  12.0),
    (47.0,  23.0),
    (67.0,  40.0),
    (83.0,  60.0),
    (999.0, 74.0),
]
GEAR_COUNT     = len(GEAR_BANDS)
GEAR_MIN_DWELL = 30           # minimum rows before a gear change is allowed (was 4)

GEAR_RPM_K: list[float] = [65.0, 41.0, 27.0, 20.0, 16.0, 13.0]

# ── RPM constants ─────────────────────────────────────────────────────────────

IDLE_RPM      = 720.0
RPM_AR        = 0.97          # was 0.82 — τ ≈ 33 s; smooth gear-to-gear transitions
RPM_NOISE_STD = 4.0           # was 35.0 — real diesel idle flicker ≈ ±5 RPM

# ── Engine load constants ─────────────────────────────────────────────────────

LOAD_BASE_IDLE   = 0.15
LOAD_SPEED_COEFF = 0.45
LOAD_ACCEL_K     = 5.0        # was 25.0 — ~5 % load per km/h/s acceleration
LOAD_DECEL_K     = 8.0        # was 15.0
LOAD_NOISE_STD   = 1.5        # was 4.0
LOAD_AR          = 0.95       # was 0.78 — τ ≈ 20 s; load tracks driving phase
LOAD_ACCEL_WIN   = 5          # rows over which to smooth speed for accel term

# ── TC slip constants ─────────────────────────────────────────────────────────

SLIP_CRUISE_MAX  = 40.0
SLIP_LOAD_SCALE  = 200.0
SLIP_SHIFT_PEAK  = 720.0
SLIP_SHIFT_DECAY = 0.55
SLIP_NOISE_STD   = 8.0

# ── Fuel constants ────────────────────────────────────────────────────────────

FUEL_IDLE_LPH    = 2.8
FUEL_BASE_L100   = 12.0
FUEL_LOAD_L100   = 10.0
FUEL_START_MIN   = 0.65
FUEL_START_RANGE = 0.25
FUEL_REFUEL_MIN  = 0.20
FUEL_REFUEL_MAX  = 0.50
GAP_MAYBE_S      = 4  * 3600
GAP_ALWAYS_S     = 12 * 3600
REFUEL_PROB      = 0.55


# ─────────────────────────────────────────────────────────────────────────────
#  UTILITY
# ─────────────────────────────────────────────────────────────────────────────

def _rng(sim_id: str, salt: str = "") -> np.random.Generator:
    digest = hashlib.sha256(f"{sim_id}:{salt}".encode()).digest()
    seed   = int.from_bytes(digest[:8], "big")
    return np.random.default_rng(seed)


# ─────────────────────────────────────────────────────────────────────────────
#  SPEED BACKBONE  (state-machine profiles, 1-Hz resolution)
# ─────────────────────────────────────────────────────────────────────────────

def _urban_profile(n: int, rng: np.random.Generator) -> np.ndarray:
    """
    Urban truck speed (km/h) at 1 Hz via behavioural state machine.
    Sequence: RAMP_UP → CRUISE → DECEL → STOP → repeat.
    Cruise uses a high-AR AR1 (τ ≈ 333 s) so speed is smooth within phase.
    """
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
    """
    Highway truck speed (km/h) at 1 Hz via behavioural state machine.
    Nearly-flat cruise (τ ≈ 666 s) interrupted by occasional slowdowns
    (toll plazas, overtaking, speed-restricted zones).
    """
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

        else:  # SLOWDOWN — toll / heavy traffic / speed restriction
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


def build_truck_speed(
    n_rows: int,
    dt_s: np.ndarray,
    gap_thr: float,
    sim_id: str,
) -> np.ndarray:
    """
    Build trip-aware truck speed series (km/h) of length n_rows.
    Each trip segment gets an independent behavioural profile.
    Deterministic: same sim_id + same timestamps → identical output.
    """
    speeds = np.zeros(n_rows, dtype=np.float64)
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
        t_rng = _rng(sim_id, f"trip_{t_idx}")
        mode  = "urban" if mode_rng.random() < URBAN_TRIP_PROB else "highway"
        prof  = (_urban_profile(t_len, t_rng) if mode == "urban"
                 else _highway_profile(t_len, t_rng))

        # Decelerate to 0 at end of every trip — trucks stop before parking.
        # Cap at 12.5% of trip length so short trips aren't dominated by ramp.
        end_rows = min(60 if mode == "urban" else 90, t_len // 8)
        if end_rows > 1:
            v0 = float(prof[t_len - end_rows - 1]) if t_len > end_rows else 0.0
            prof[t_len - end_rows:] = np.linspace(v0, 0.0, end_rows)

        speeds[t0:t1] = prof

    return speeds


# ─────────────────────────────────────────────────────────────────────────────
#  SIGNAL DERIVATION
# ─────────────────────────────────────────────────────────────────────────────

def derive_gear(speeds: np.ndarray) -> np.ndarray:
    """
    Sequential 6-speed gear state machine with hysteresis and minimum dwell.
    GEAR_MIN_DWELL = 30 rows ensures no gear hunting at 1 Hz.
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


def derive_load(speeds: np.ndarray, dt_s: np.ndarray,
                rng: np.random.Generator) -> np.ndarray:
    """
    Engine load (%) from speed and acceleration.
    Speed is pre-smoothed over LOAD_ACCEL_WIN rows before computing the
    acceleration term, suppressing per-step noise from state transitions.
    """
    n = len(speeds)

    kern  = np.ones(LOAD_ACCEL_WIN) / LOAD_ACCEL_WIN
    spd_s = np.convolve(speeds, kern, mode="same")

    accel = np.zeros(n)
    if n > 1:
        dt_safe  = np.maximum(dt_s, 0.5)
        accel[1:] = np.diff(spd_s) / dt_safe

    base  = LOAD_BASE_IDLE + (speeds / H_MAX) * LOAD_SPEED_COEFF
    a_pos = np.clip( accel, 0.0, None) * LOAD_ACCEL_K
    a_neg = np.clip(-accel, 0.0, None) * LOAD_DECEL_K

    raw   = base * 100.0 + a_pos - a_neg
    noise = rng.normal(0.0, LOAD_NOISE_STD, n)

    load    = np.empty(n)
    load[0] = float(np.clip(raw[0] + noise[0], 5.0, 97.0))
    for i in range(1, n):
        load[i] = float(np.clip(
            LOAD_AR * load[i - 1] + (1.0 - LOAD_AR) * raw[i] + noise[i],
            5.0, 97.0,
        ))
    return load


def derive_rpm(speeds: np.ndarray, gears: np.ndarray,
               rng: np.random.Generator) -> np.ndarray:
    """
    Diesel RPM from speed and gear.  Idle at 720; governed top ~2 200 RPM.
    RPM_AR = 0.97 (τ ≈ 33 s) produces smooth transitions across gear changes.
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
            RPM_AR * rpm[i - 1] + (1.0 - RPM_AR) * nominal[i] + noise[i],
            IDLE_RPM, 2250.0,
        ))
    return rpm


def derive_tc_slip(speeds: np.ndarray, gears: np.ndarray,
                   loads: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """
    Torque-converter slip (RPM).
    Spikes on gear changes, proportional to load otherwise.
    """
    n           = len(speeds)
    noise       = np.abs(rng.normal(0.0, SLIP_NOISE_STD, n))
    slips       = np.zeros(n)
    shift_carry = 0.0

    for i in range(n):
        s = speeds[i]
        l = loads[i]

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
                fill      = FUEL_REFUEL_MIN + refuel_rng.random() * FUEL_REFUEL_MAX
                current   = min(100.0, current + fill * 100.0)
                n_refuels += 1
            elif dt >= GAP_MAYBE_S and refuel_rng.random() < REFUEL_PROB:
                fill      = FUEL_REFUEL_MIN + refuel_rng.random() * (FUEL_REFUEL_MAX - FUEL_REFUEL_MIN)
                current   = min(100.0, current + fill * 100.0)
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
    ts  = pd.to_datetime(df["timestamp"], utc=True, errors="coerce")
    bad = ts.isna().sum()
    if bad:
        print(f"    [WARN]  Dropping {bad} rows with unparseable timestamps")
    return ts


def _write_back(df: pd.DataFrame, original_cols: list, csv_path: Path) -> None:
    df["timestamp"] = df["_ts"].dt.strftime("%Y-%m-%d %H:%M:%S+00:00")
    df[original_cols].to_csv(csv_path, index=False)


# ── Transmission ──────────────────────────────────────────────────────────────

_TRANS_COLS = {
    "vehicle_speed_kmh":          "speed",
    "gear_position_actual":       "gear",
    "gear_commanded_target":      "gear",
    "engine_rpm":                 "rpm",
    "engine_load_absolute_pct":   "load_abs",
    "engine_load_calculated_pct": "load_calc",
    "torque_converter_slip_speed": "slip",
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

    # engine_load_calculated_pct: same physics, slight calibration bias + independent noise
    cal_bias  = float(_rng(sim_id, "load_cal_bias").uniform(-2.0, 2.0))
    load_calc = np.clip(load + cal_bias + rng.normal(0.0, 0.6, n), 5.0, 97.0)

    derived   = {"speed": speed, "gear": gears.astype(float),
                 "rpm": rpm, "load_abs": load, "load_calc": load_calc, "slip": slip}
    present   = {col: key for col, key in _TRANS_COLS.items() if col in df.columns}
    not_found = [col for col in _TRANS_COLS if col not in df.columns]
    if not_found:
        print(f"    [INFO] Columns not in CSV (skipped): {not_found}")

    stats = {
        "rows":  n, "trips": info["n_trips"],
        "speed": f"{speed.min():.0f}-{speed.max():.0f} km/h (avg={speed.mean():.0f})",
        "gear":  {int(g): int((gears == g).sum()) for g in range(1, 7)},
        "rpm":   f"{rpm.min():.0f}-{rpm.max():.0f}",
        "load":  f"{load.min():.1f}-{load.max():.1f}%",
        "slip":  f"{slip.min():.0f}-{slip.max():.0f} RPM",
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
    "engine_load_absolute": "load",
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

    derived   = {"rpm": rpm, "load": load}
    present   = {col: key for col, key in _ENGINE_COLS.items() if col in df.columns}
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
    fuel, n_refuels = derive_fuel(speed, load, dt_s, gap, sim_id,
                                   _rng(sim_id, "fuel_noise"))

    stats = {
        "rows":       n, "trips": info["n_trips"],
        "speed":      f"{speed.min():.0f}-{speed.max():.0f} km/h (avg={speed.mean():.0f})",
        "fuel_start": f"{fuel[0]:.1f}%",
        "fuel_end":   f"{fuel[-1]:.1f}%",
        "fuel_range": f"{fuel.min():.1f}-{fuel.max():.1f}%",
        "n_refuels":  n_refuels,
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
                bar = "  ".join(f"G{k}={v:>5}" for k, v in r["gear"].items())
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
