"""
fix_cabin_physics.py
====================
Rewrites three cabin environment columns in body CSVs with physically
coherent values for a diesel truck cabin in Indian intercity conditions.

All three signals are co-simulated in one pass because they are
causally linked: AC compressor load drives how fast the cabin cools,
and active cooling also dehumidifies the cabin air.

Simulation order per row
------------------------
  speed (engine on?) -> AC load -> cabin temp -> humidity

Columns fixed
-------------
  body: cabin_temperature      (C)   — air temp inside the cab
        cabin_humidity_pct     (%)   — relative humidity inside the cab
        ac_compressor_load_pct (%)   — how hard the HVAC compressor is working

Fleet assumptions
-----------------
  - Indian summer ambient: 32-42 C, 35-72 % RH (varies by route/sim)
  - 80 % of trucks have working AC; the rest rely on ventilation only
  - Cabin setpoint (driver preference): 22-26 C
  - When parked with engine off: cabin soaks toward ambient + solar gain
  - When engine starts: AC pulls cabin toward setpoint over ~8-12 minutes
  - No-AC trucks: cabin stays near ambient throughout driving

Usage
-----
  python fix_cabin_physics.py              # live, prompts before writing
  python fix_cabin_physics.py --dry-run    # audit only, zero writes
  python fix_cabin_physics.py --yes        # live, skip confirmation
  python fix_cabin_physics.py --root /path/to/vehicles
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

# ── Gap / trip detection ──────────────────────────────────────────────────────

GAP_MULTIPLIER = 5
GAP_MIN_S      = 300

# ── Truck speed profile (same constants as other fix_* scripts) ───────────────

URBAN_TRIP_PROB = 0.55

U_MEAN = 22.0;  U_STD = 11.0;  U_AR = 0.87;  U_MAX = 48.0
U_STOP_P = 0.06; U_STOP_MIN = 4; U_STOP_MAX = 30
U_EMA = 0.12;   U_RAMP = 120

H_MEAN = 76.0;  H_STD = 6.0;  H_AR = 0.97;  H_MIN = 50.0;  H_MAX = 88.0
H_SLOW_P = 0.008; H_SLOW_MIN = 8; H_SLOW_MAX = 25
H_EMA = 0.04;  H_RAMP = 90

# ── Ambient environment (per-sim, Indian summer intercity routes) ──────────────

AMBIENT_MIN         = 32.0   # C  minimum outdoor temperature
AMBIENT_RANGE       = 10.0   # C  spread across sims (Delhi hotter, hills cooler)
SOLAR_GAIN_MIN      = 4.0    # C  extra heat when cab is parked in sun
SOLAR_GAIN_RANGE    = 4.0    # C  spread
AMBIENT_HUMID_MIN   = 35.0   # %  minimum ambient RH
AMBIENT_HUMID_RANGE = 37.0   # %  spread (Delhi dry 35%, Lucknow/east humid ~72%)

# ── AC system ────────────────────────────────────────────────────────────────

AC_AVAIL_PROB    = 0.80   # fraction of trucks with working AC
AC_SETPOINT_MIN  = 22.0   # C
AC_SETPOINT_RANGE = 4.0   # C  (22-26 C driver preference spread)
AC_GAIN          = 6.0    # % compressor load per degree above setpoint
AC_IDLE_LOAD     = 10.0   # % base load when AC is on but near setpoint
AC_MIN_ON        = 5.0    # % floor while AC is engaged
AC_AR            = 0.88   # smoothing on compressor load (cycles, not bang-bang)
AC_NOISE_STD     = 2.5    # % Gaussian jitter on compressor load

# ── Thermal model ─────────────────────────────────────────────────────────────

TEMP_TAU_AC_S    = 480.0  # s  time constant when AC is cooling actively (~8 min)
TEMP_TAU_VENT_S  = 720.0  # s  engine on, AC off / no AC — ventilation only
TEMP_TAU_SOAK_S  = 300.0  # s  engine off, cabin heating toward soak temp (~5 min)
TEMP_NOISE_STD   = 0.05   # C

# ── Humidity model ────────────────────────────────────────────────────────────

DEHUMID_MAX_PER_S = 0.04  # %/s at 100 % AC load (= 2.4 %/min — automotive AC)
HUMID_TAU_S       = 900.0 # s  time constant for humidity to drift back to ambient
HUMID_NOISE_STD   = 0.08  # %
HUMID_MIN         = 18.0  # % absolute floor
HUMID_MAX         = 95.0  # %


# ─────────────────────────────────────────────────────────────────────────────
#  SHARED UTILITIES
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
        "rows":    len(ts),
        "gap_thr": round(gap_thr, 1),
        "n_gaps":  int(len(gaps)),
        "n_trips": int(len(gaps)) + 1,
        "span_h":  round(span_s / 3600.0, 2),
    }


# ─────────────────────────────────────────────────────────────────────────────
#  CABIN CO-SIMULATION  (single pass: AC load -> cabin temp -> humidity)
# ─────────────────────────────────────────────────────────────────────────────

def derive_cabin(
    speeds: np.ndarray,
    dt_s: np.ndarray,
    gap_thr: float,
    sim_id: str,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, dict]:
    """
    Returns (cabin_temp, ac_load, humidity, meta) where meta carries
    the per-sim constants so they appear in dry-run output.
    """
    n = len(speeds)

    param_rng    = _rng(sim_id, "cabin_params")
    ac_available = bool(param_rng.random() < AC_AVAIL_PROB)
    setpoint     = AC_SETPOINT_MIN  + float(param_rng.random()) * AC_SETPOINT_RANGE
    ambient      = AMBIENT_MIN      + float(param_rng.random()) * AMBIENT_RANGE
    solar_gain   = SOLAR_GAIN_MIN   + float(param_rng.random()) * SOLAR_GAIN_RANGE
    amb_humidity = AMBIENT_HUMID_MIN + float(param_rng.random()) * AMBIENT_HUMID_RANGE

    noise_temp  = _rng(sim_id, "cabin_t_noise").normal(0.0, TEMP_NOISE_STD,  n)
    noise_ac    = _rng(sim_id, "cabin_ac_noise").normal(0.0, AC_NOISE_STD,   n)
    noise_humid = _rng(sim_id, "cabin_h_noise").normal(0.0, HUMID_NOISE_STD, n)

    cab_temp = np.empty(n)
    ac_load  = np.zeros(n)
    humidity = np.empty(n)

    cur_temp     = ambient + solar_gain * 0.6  # start partially soaked
    cur_ac_load  = 0.0
    cur_humidity = amb_humidity

    cab_temp[0] = cur_temp
    humidity[0] = cur_humidity

    for i in range(1, n):
        dt = dt_s[i - 1]
        s  = speeds[i]

        if dt > gap_thr:
            cur_temp     = ambient + solar_gain
            cur_humidity = amb_humidity
            cur_ac_load  = 0.0
            cab_temp[i]  = cur_temp + noise_temp[i] * 0.5
            humidity[i]  = np.clip(cur_humidity + noise_humid[i] * 0.3,
                                   HUMID_MIN, HUMID_MAX)
            ac_load[i]   = 0.0
            continue

        # Engine is on for the entire trip — including urban stops at traffic lights.
        # Only gap periods (dt > gap_thr) represent true engine-off.
        if ac_available:
            error        = max(0.0, cur_temp - setpoint)
            load_target  = min(95.0, AC_GAIN * error + AC_IDLE_LOAD)
            cur_ac_load  = AC_AR * cur_ac_load + (1.0 - AC_AR) * load_target + noise_ac[i]
            cur_ac_load  = float(np.clip(cur_ac_load, AC_MIN_ON, 95.0))
        else:
            cur_ac_load = max(0.0, cur_ac_load - 5.0 * dt)

        ac_load[i] = cur_ac_load

        if ac_available and cur_ac_load > AC_MIN_ON:
            temp_target = setpoint
            tau         = TEMP_TAU_AC_S
        else:
            temp_target = ambient - 2.0
            tau         = TEMP_TAU_VENT_S

        alpha_temp   = 1.0 - math.exp(-dt / tau)
        cur_temp     = cur_temp + alpha_temp * (temp_target - cur_temp) + noise_temp[i]
        cab_temp[i]  = float(np.clip(cur_temp, 18.0, 58.0))

        if cur_ac_load > 10.0:
            dehumid_rate = (cur_ac_load / 100.0) * DEHUMID_MAX_PER_S
            cur_humidity = max(HUMID_MIN, cur_humidity - dehumid_rate * dt)
        else:
            alpha_h      = 1.0 - math.exp(-dt / HUMID_TAU_S)
            cur_humidity = cur_humidity + alpha_h * (amb_humidity - cur_humidity)

        humidity[i] = float(np.clip(cur_humidity + noise_humid[i],
                                    HUMID_MIN, HUMID_MAX))

    meta = {
        "ac_available": ac_available,
        "setpoint_c":   round(setpoint, 1),
        "ambient_c":    round(ambient, 1),
        "solar_gain_c": round(solar_gain, 1),
        "amb_humidity": round(amb_humidity, 1),
    }
    return cab_temp, ac_load, humidity, meta


# ─────────────────────────────────────────────────────────────────────────────
#  FILE DISCOVERY
# ─────────────────────────────────────────────────────────────────────────────

_TARGET_COLS = [
    "cabin_temperature",
    "cabin_humidity_pct",
    "ac_compressor_load_pct",
]


def find_body_csv(sim_dir: Path) -> Path | None:
    hits = sorted(sim_dir.glob("*body*scenarioA*.csv"))
    if not hits:
        hits = sorted(sim_dir.glob("*body*.csv"))
    return hits[0] if hits else None


def discover_sims(root: Path) -> list[tuple[str, Path]]:
    sims = []
    if not root.exists():
        print(f"[ERROR] Vehicles root not found: {root}")
        return sims
    for sim_dir in sorted(d for d in root.iterdir() if d.is_dir()):
        csv = find_body_csv(sim_dir)
        if csv:
            sims.append((sim_dir.name, sim_dir))
        else:
            print(f"  [WARN] {sim_dir.name}: no body CSV found — skipped")
    return sims


# ─────────────────────────────────────────────────────────────────────────────
#  PER-SIM FIX
# ─────────────────────────────────────────────────────────────────────────────

def fix_cabin(sim_id: str, sim_dir: Path, dry_run: bool) -> dict:
    csv_path = find_body_csv(sim_dir)
    if csv_path is None:
        print(f"  [CABIN] body CSV not found — skipped")
        return {}

    print(f"  [CABIN]  {csv_path.name}")
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

    speed = build_truck_speed(n, dt_s, info["gap_thr"], sim_id)
    cab_temp, ac_load, humidity, meta = derive_cabin(
        speed, dt_s, info["gap_thr"], sim_id
    )

    present   = [c for c in _TARGET_COLS if c in df.columns]
    not_found = [c for c in _TARGET_COLS if c not in df.columns]
    if not_found:
        print(f"    [INFO] Columns not in CSV (skipped): {not_found}")

    ac_on_mask = speed > 0.5

    stats = {
        "rows":        n,
        "trips":       info["n_trips"],
        "ac_available": meta["ac_available"],
        "setpoint_c":  meta["setpoint_c"],
        "ambient_c":   meta["ambient_c"],
        "amb_humidity": meta["amb_humidity"],
        "temp":  (f"{cab_temp.min():.1f}-{cab_temp.max():.1f} C  "
                  f"driving_avg={cab_temp[ac_on_mask].mean():.1f} C  "
                  f"parked_avg={cab_temp[~ac_on_mask].mean():.1f} C"),
        "ac":    (f"{ac_load.min():.0f}-{ac_load.max():.0f}%  "
                  f"driving_avg={ac_load[ac_on_mask].mean():.1f}%")
                  if meta["ac_available"] else "0% (no AC)",
        "humid": (f"{humidity.min():.1f}-{humidity.max():.1f}%  "
                  f"avg={humidity.mean():.1f}%"),
    }

    if dry_run:
        return stats

    derived = {
        "cabin_temperature":      np.round(cab_temp, 3),
        "cabin_humidity_pct":     np.round(humidity, 3),
        "ac_compressor_load_pct": np.round(ac_load, 3),
    }
    for col in present:
        df[col] = derived[col]

    df["timestamp"] = df["_ts"].dt.strftime("%Y-%m-%d %H:%M:%S+00:00")
    df[orig].to_csv(csv_path, index=False)

    return stats


# ─────────────────────────────────────────────────────────────────────────────
#  SUMMARY + ENTRY POINT
# ─────────────────────────────────────────────────────────────────────────────

def _print_summary(all_results: dict, dry_run: bool) -> None:
    print("\n\n" + "=" * 68)
    print("  SUMMARY" + ("  (DRY RUN - no files written)" if dry_run else ""))
    print("=" * 68)

    for sim_id, r in all_results.items():
        if not r:
            print(f"\n  {sim_id}  -> SKIPPED")
            continue
        ac_str = "AC: YES" if r["ac_available"] else "AC: NO (ventilation only)"
        print(f"\n  {sim_id}  ({r['rows']:,} rows  {r['trips']} trips  |  "
              f"{ac_str}  setpoint={r['setpoint_c']}C  "
              f"ambient={r['ambient_c']}C  ext_RH={r['amb_humidity']}%)")
        print(f"    Temp  : {r['temp']}")
        print(f"    AC    : {r['ac']}")
        print(f"    Humid : {r['humid']}")

    print("\n" + "=" * 68 + "\n")


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
    print("  fix_cabin_physics.py  --  Diesel truck cabin environment")
    print("=" * 68)
    print(f"  Vehicles root : {root}")
    print(f"  Mode          : {'DRY RUN (no writes)' if dry_run else 'LIVE  (files will be overwritten)'}")
    print("=" * 68)
    print(textwrap.dedent("""
    Columns to fix (body CSV)
    -------------------------
      cabin_temperature       (C)
      cabin_humidity_pct      (%)
      ac_compressor_load_pct  (%)

    Co-simulated in order: speed -> AC load -> cabin temp -> humidity
    80% of trucks have working AC; the rest show cabin near ambient.
    """))

    if not dry_run and not skip_ok:
        ans = input("This will overwrite body CSVs. Continue? (y/n): ").strip().lower()
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
            all_results[sim_id] = fix_cabin(sim_id, sim_dir, dry_run)
        except Exception as exc:
            import traceback
            print(f"  [ERROR] {sim_id} failed: {exc}")
            traceback.print_exc()

    _print_summary(all_results, dry_run)


if __name__ == "__main__":
    main()
