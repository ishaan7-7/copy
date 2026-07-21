"""
fix_battery_physics.py
======================
Rewrites four battery KPI columns in battery CSVs with values that reflect
a 24V lead-acid STARTING battery on a diesel truck — not an EV traction pack.

Role of this battery
--------------------
Engine cranking + powering accessories (ECU, telematics, lights).
The alternator charges it while the engine is running.
When parked, it slowly self-discharges from standby loads.

Columns fixed
-------------
  battery_state_of_charge_soc_pct  (%)  — charge level
  battery_state_of_health_soh_pct  (%)  — capacity vs original (age proxy)
  battery_temperature_cell          (C)  — cell temp follows charge/ambient
  battery_voltage_ecu_7ee           (V)  — 24V bus: ~28V charging, ~25V resting

Voltage note
------------
Indian medium-heavy trucks run 24V systems (two 12V batteries in series).
The dry-run output prints the voltage range so you can spot if the existing
data was recording a 12V single-battery reading — in that case halve the
VOLT_* constants below before writing.

Usage
-----
  python fix_battery_physics.py              # live, prompts before writing
  python fix_battery_physics.py --dry-run    # audit only, zero writes
  python fix_battery_physics.py --yes        # live, skip confirmation
  python fix_battery_physics.py --root /path/to/vehicles
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

# ── Gap / trip detection (same logic as fix_vehicle_physics.py) ───────────────

GAP_MULTIPLIER = 5
GAP_MIN_S      = 300

# ── Truck speed profile (same constants — same trip classification) ───────────

URBAN_TRIP_PROB = 0.55

U_MEAN = 22.0;  U_STD = 11.0;  U_AR = 0.87;  U_MAX = 48.0
U_STOP_P = 0.06; U_STOP_MIN = 4; U_STOP_MAX = 30
U_EMA = 0.12;   U_RAMP = 120

H_MEAN = 76.0;  H_STD = 6.0;  H_AR = 0.97;  H_MIN = 50.0;  H_MAX = 88.0
H_SLOW_P = 0.008; H_SLOW_MIN = 8; H_SLOW_MAX = 25
H_EMA = 0.04;  H_RAMP = 90

# ── Battery — State of Charge (%%) ────────────────────────────────────────────

SOC_START_MIN    = 85.0    # minimum starting SoC
SOC_START_RANGE  = 12.0    # spread across fleet (85-97 %)
SOC_CEILING      = 97.0    # alternator keeps battery below full to extend life
SOC_FLOOR        = 50.0    # floor: below this a diesel struggles to crank
SOC_CHARGE_PER_S = 0.0004  # %/s when alternator is running (~1.5 %/min)
SOC_IDLE_DRAIN   = 0.00011 # %/s standby drain (ECU, telematics: ~0.4 %/h)
SOC_PARK_PER_H   = 1.5     # %/h drain during long parked gaps

# ── Battery — State of Health (%%) ───────────────────────────────────────────

SOH_MIN          = 72.0    # oldest trucks in fleet
SOH_MAX          = 99.0    # newest / well-maintained
SOH_DRIFT_PER_H  = 0.0008  # capacity fade per operating hour (essentially flat)

# ── Battery — Cell Temperature (°C) ──────────────────────────────────────────

TEMP_AMBIENT_MIN   = 30.0  # °C minimum ambient (Indian climate)
TEMP_AMBIENT_RANGE = 10.0  # spread across sims / seasons
TEMP_CHARGE_DELTA  = 10.0  # °C above ambient when alternator is charging hard
TEMP_COOLING_TAU_S = 1800  # seconds — thermal time constant (30 min to cool)
TEMP_NOISE_STD     = 0.5   # °C Gaussian noise

# ── Battery — Voltage (V, 24V lead-acid bus) ─────────────────────────────────
#
#   Charging  (engine on)   : 27.6 – 28.8 V  (alternator output, load-dependent)
#   Resting   (engine off)  : 23.0 V (0 % SoC) – 25.6 V (100 % SoC)
#
#   Formula  V_rest = VOLT_REST_BASE + (SoC/100) * VOLT_REST_RANGE

VOLT_CHARGE_MEAN = 28.2    # V — mean alternator voltage while cruising
VOLT_IDLE_MEAN   = 27.6    # V — alternator at idle RPM (stopped at light, engine on)
VOLT_CHARGE_STD  = 0.15    # V — variation (high-RPM spikes, accessory load)
VOLT_CHARGE_AR   = 0.92
VOLT_REST_BASE   = 23.0    # V at SoC = 0 %
VOLT_REST_RANGE  = 2.6     # V, so at SoC = 100 % → 25.6 V
VOLT_NOISE_STD   = 0.04    # V when resting


# ─────────────────────────────────────────────────────────────────────────────
#  SHARED UTILITIES (copied from fix_vehicle_physics.py for standalone use)
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
    b = 1.0 - alpha
    for i in range(1, len(series)):
        out[i] = alpha * series[i] + b * out[i - 1]
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
    i = 0
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
    i = 0
    while i < n:
        if rng.random() < H_SLOW_P:
            slow_len = min(int(rng.integers(H_SLOW_MIN, H_SLOW_MAX + 1)), n - i)
            raw[i:i + slow_len] = np.clip(rng.normal(35.0, 10.0, slow_len), 0.0, 60.0)
            i += slow_len
        else:
            i += 1
    return _ramp(n, H_RAMP, np.clip(_ema(raw, H_EMA), 0.0, H_MAX))


def build_truck_speed(n_rows: int, dt_s: np.ndarray,
                      gap_thr: float, sim_id: str) -> np.ndarray:
    speeds      = np.zeros(n_rows, dtype=np.float64)
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
#  BATTERY SIGNAL DERIVATION
# ─────────────────────────────────────────────────────────────────────────────

def derive_soc(speeds: np.ndarray, dt_s: np.ndarray,
               gap_thr: float, sim_id: str) -> np.ndarray:
    n      = len(speeds)
    soc    = np.empty(n)
    start  = SOC_START_MIN + float(_rng(sim_id, "soc_start").random()) * SOC_START_RANGE
    cur    = start
    soc[0] = cur

    for i in range(1, n):
        dt = dt_s[i - 1]
        s  = speeds[i]

        if dt > gap_thr:
            drain = SOC_PARK_PER_H * (dt / 3600.0)
            cur   = max(SOC_FLOOR, cur - drain)
            soc[i] = cur
            continue

        taper = max(0.0, 1.0 - cur / SOC_CEILING)
        rate  = SOC_CHARGE_PER_S if s > 0.5 else SOC_CHARGE_PER_S * 0.6
        cur   = min(SOC_CEILING, cur + rate * taper * dt)
        soc[i] = cur

    return soc


def derive_soh(n: int, span_h: float, sim_id: str) -> np.ndarray:
    base     = SOH_MIN + float(_rng(sim_id, "soh_base").random()) * (SOH_MAX - SOH_MIN)
    end_val  = max(SOH_MIN, base - SOH_DRIFT_PER_H * span_h)
    soh      = np.linspace(base, end_val, n)
    return soh


def derive_bat_temp(speeds: np.ndarray, dt_s: np.ndarray,
                    gap_thr: float, sim_id: str) -> np.ndarray:
    n       = len(speeds)
    ambient = TEMP_AMBIENT_MIN + float(_rng(sim_id, "temp_ambient").random()) * TEMP_AMBIENT_RANGE
    noise   = _rng(sim_id, "temp_noise").normal(0.0, TEMP_NOISE_STD, n)

    temp    = np.empty(n)
    cur     = ambient
    temp[0] = cur + noise[0]

    for i in range(1, n):
        dt = dt_s[i - 1]
        s  = speeds[i]

        if dt > gap_thr:
            cur    = ambient
            temp[i] = cur + noise[i]
            continue

        target = ambient + (TEMP_CHARGE_DELTA if s > 0.5 else 0.0)
        alpha  = 1.0 - math.exp(-dt / TEMP_COOLING_TAU_S)
        cur    = cur + alpha * (target - cur)
        temp[i] = cur + noise[i]

    return np.clip(temp, 20.0, 65.0)


def derive_voltage(speeds: np.ndarray, soc: np.ndarray,
                   dt_s: np.ndarray, gap_thr: float,
                   sim_id: str) -> np.ndarray:
    n    = len(speeds)
    rng  = _rng(sim_id, "volt_noise")

    charge_noise = rng.normal(0.0, VOLT_CHARGE_STD, n)
    rest_noise   = rng.normal(0.0, VOLT_NOISE_STD, n)

    volt     = np.empty(n)
    v_charge = VOLT_CHARGE_MEAN

    for i in range(n):
        in_gap = i > 0 and dt_s[i - 1] > gap_thr
        if in_gap:
            v_rest  = VOLT_REST_BASE + (soc[i] / 100.0) * VOLT_REST_RANGE
            volt[i] = np.clip(v_rest + rest_noise[i], 22.5, 26.0)
        elif speeds[i] > 0.5:
            v_charge = VOLT_CHARGE_AR * v_charge + (1.0 - VOLT_CHARGE_AR) * VOLT_CHARGE_MEAN
            volt[i]  = np.clip(v_charge + charge_noise[i], 27.0, 29.2)
        else:
            v_charge = VOLT_CHARGE_AR * v_charge + (1.0 - VOLT_CHARGE_AR) * VOLT_IDLE_MEAN
            volt[i]  = np.clip(v_charge + charge_noise[i], 26.5, 28.8)

    return volt


# ─────────────────────────────────────────────────────────────────────────────
#  FILE DISCOVERY
# ─────────────────────────────────────────────────────────────────────────────

def find_battery_csv(sim_dir: Path) -> Path | None:
    hits = sorted(sim_dir.glob("*battery*scenarioA*.csv"))
    if not hits:
        hits = sorted(sim_dir.glob("*battery*.csv"))
    return hits[0] if hits else None


def discover_sims(root: Path) -> list[tuple[str, Path]]:
    sims = []
    if not root.exists():
        print(f"[ERROR] Vehicles root not found: {root}")
        return sims
    for sim_dir in sorted(d for d in root.iterdir() if d.is_dir()):
        csv = find_battery_csv(sim_dir)
        if csv:
            sims.append((sim_dir.name, sim_dir))
        else:
            print(f"  [WARN] {sim_dir.name}: no battery CSV found — skipped")
    return sims


# ─────────────────────────────────────────────────────────────────────────────
#  COLUMNS TO FIX
# ─────────────────────────────────────────────────────────────────────────────

_TARGET_COLS = [
    "battery_state_of_charge_soc_pct",
    "battery_state_of_health_soh_pct",
    "battery_temperature_cell",
    "battery_voltage_ecu_7ee",
]


# ─────────────────────────────────────────────────────────────────────────────
#  PER-SIM FIX
# ─────────────────────────────────────────────────────────────────────────────

def fix_battery(sim_id: str, sim_dir: Path, dry_run: bool) -> dict:
    csv_path = find_battery_csv(sim_dir)
    if csv_path is None:
        print(f"  [BATTERY] CSV not found — skipped")
        return {}

    print(f"  [BATTERY]  {csv_path.name}")
    df   = pd.read_csv(csv_path, low_memory=False)
    orig = list(df.columns)

    if "timestamp" not in df.columns:
        print(f"    [ERROR] No 'timestamp' column — skipped")
        return {}

    df["_ts"] = pd.to_datetime(df["timestamp"], utc=True, errors="coerce")
    df = df.dropna(subset=["_ts"]).sort_values("_ts").reset_index(drop=True)

    info  = analyse_timestamps(df["_ts"])
    n     = info["rows"]
    ts_ns = df["_ts"].values.astype("datetime64[ns]").astype(np.int64)
    dt_s  = np.maximum(np.diff(ts_ns) / 1e9, 0.0)

    gap   = info["gap_thr"]
    speed = build_truck_speed(n, dt_s, gap, sim_id)

    soc   = derive_soc(speed, dt_s, gap, sim_id)
    soh   = derive_soh(n, info["span_h"], sim_id)
    temp  = derive_bat_temp(speed, dt_s, gap, sim_id)
    volt  = derive_voltage(speed, soc, dt_s, gap, sim_id)

    present   = [c for c in _TARGET_COLS if c in df.columns]
    not_found = [c for c in _TARGET_COLS if c not in df.columns]
    if not_found:
        print(f"    [INFO] Columns not in CSV (skipped): {not_found}")

    stats = {
        "rows":     n,
        "trips":    info["n_trips"],
        "soc":      f"{soc.min():.1f}-{soc.max():.1f}%  start={soc[0]:.1f}%  end={soc[-1]:.1f}%",
        "soh":      f"{soh[0]:.2f}% -> {soh[-1]:.2f}%",
        "temp":     f"{temp.min():.1f}-{temp.max():.1f} C",
        "voltage":  f"{volt.min():.2f}-{volt.max():.2f} V  (charging={volt[speed>0.5].mean():.2f} V  resting={volt[speed<=0.5].mean():.2f} V)",
    }

    if dry_run:
        return stats

    derived = {
        "battery_state_of_charge_soc_pct": np.round(soc, 3),
        "battery_state_of_health_soh_pct": np.round(soh, 3),
        "battery_temperature_cell":         np.round(temp, 3),
        "battery_voltage_ecu_7ee":          np.round(volt, 3),
    }

    for col in present:
        df[col] = derived[col]

    df["timestamp"] = df["_ts"].dt.strftime("%Y-%m-%d %H:%M:%S+00:00")
    df[orig].to_csv(csv_path, index=False)

    return stats


# ─────────────────────────────────────────────────────────────────────────────
#  ORCHESTRATION + SUMMARY
# ─────────────────────────────────────────────────────────────────────────────

def _print_summary(all_results: dict, dry_run: bool) -> None:
    print("\n\n" + "=" * 68)
    print("  SUMMARY" + ("  (DRY RUN - no files written)" if dry_run else ""))
    print("=" * 68)

    for sim_id, r in all_results.items():
        if not r:
            print(f"\n  {sim_id}  -> SKIPPED")
            continue
        print(f"\n  {sim_id}  ({r['rows']:,} rows  {r['trips']} trips)")
        print(f"    SoC  : {r['soc']}")
        print(f"    SoH  : {r['soh']}")
        print(f"    Temp : {r['temp']}")
        print(f"    Volt : {r['voltage']}")

    print("\n" + "=" * 68 + "\n")


def main() -> None:
    args    = sys.argv[1:]
    dry_run = "--dry-run" in args
    skip_ok = "--yes"     in args

    root = VEHICLES_ROOT
    for _flag in ("--root", "--data-root"):
        if _flag in args:
            _idx = args.index(_flag)
            if _idx + 1 < len(args):
                root = Path(args[_idx + 1])
            else:
                print(f"[ERROR] {_flag} requires a path argument")
                sys.exit(1)
            break

    print("=" * 68)
    print("  fix_battery_physics.py  --  Diesel truck 24V lead-acid battery")
    print("=" * 68)
    print(f"  Vehicles root : {root}")
    print(f"  Mode          : {'DRY RUN (no writes)' if dry_run else 'LIVE  (files will be overwritten)'}")
    print("=" * 68)
    print(textwrap.dedent("""
    Columns to fix
    --------------
      battery_state_of_charge_soc_pct  (%)
      battery_state_of_health_soh_pct  (%)
      battery_temperature_cell          (C)
      battery_voltage_ecu_7ee           (V, 24V bus)

    Voltage calibration: dry-run prints charging vs resting mean.
    If charging mean is ~14V instead of ~28V, halve all VOLT_* constants.
    """))

    if not dry_run and not skip_ok:
        ans = input("This will overwrite battery CSVs. Continue? (y/n): ").strip().lower()
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
        print(f"\n{'=' * 68}")
        print(f"  SIM: {sim_id}  |  {'DRY RUN' if dry_run else 'LIVE WRITE'}")
        print(f"{'=' * 68}")
        try:
            all_results[sim_id] = fix_battery(sim_id, sim_dir, dry_run)
        except Exception as exc:
            import traceback
            print(f"  [ERROR] {sim_id} failed: {exc}")
            traceback.print_exc()

    _print_summary(all_results, dry_run)


if __name__ == "__main__":
    main()
