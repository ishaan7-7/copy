"""
generate_physics_audit.py
=========================
Generates PHYSICS_AUDIT.md in the same directory as this script.

Run on any device that has the vehicle CSVs:
    python generate_physics_audit.py
    python generate_physics_audit.py --root /path/to/data/vehicles

Section 1 — Algorithm Reference: always written (constants embedded here).
Section 2 — Data Audit:          auto-filled from whatever CSVs are found.
Section 3 — Expansion Blueprint: always written (planning reference).
"""

from __future__ import annotations

import sys
import math
import hashlib
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    import pandas as pd
    _PANDAS = True
except ImportError:
    _PANDAS = False

# ── Paths ─────────────────────────────────────────────────────────────────────

SCRIPT_DIR    = Path(__file__).resolve().parent
ROOT_DIR      = SCRIPT_DIR.parent
VEHICLES_ROOT = ROOT_DIR / "data" / "vehicles"
OUTPUT_MD     = SCRIPT_DIR / "PHYSICS_AUDIT.md"

# ─────────────────────────────────────────────────────────────────────────────
#  CONSTANTS — mirrored from all fix_* scripts
# ─────────────────────────────────────────────────────────────────────────────

GAP_MULTIPLIER = 5
GAP_MIN_S      = 300

# ── Shared speed backbone ──────────────────────────────────────────────────────

SPEED = {
    "urban": {
        "mean_kmh": 22.0, "std_kmh": 11.0, "ar": 0.87, "max_kmh": 48.0,
        "stop_prob": 0.06, "stop_min_s": 4, "stop_max_s": 30,
        "ema_alpha": 0.12, "ramp_rows": 120,
        "description": "City / congested NH — random stops, governed at 48 km/h",
    },
    "highway": {
        "mean_kmh": 76.0, "std_kmh": 6.0, "ar": 0.97,
        "min_kmh": 50.0, "max_kmh": 88.0,
        "slowdown_prob": 0.008, "slowdown_min_s": 8, "slowdown_max_s": 25,
        "ema_alpha": 0.04, "ramp_rows": 90,
        "description": "Expressway cruise — governed at 88 km/h, rare toll slowdowns",
    },
    "urban_trip_prob": 0.55,
    "rng_seed_scheme": "sha256(sim_id:salt)[:8] → np.random.default_rng",
}

# ── Transmission / Engine (fix_vehicle_physics.py) ─────────────────────────────

TRANSMISSION = {
    "columns_fixed": [
        "vehicle_speed_kmh",
        "gear_position_actual",
        "gear_commanded_target",
        "engine_rpm",
        "engine_load_absolute_pct",
        "engine_load_calculated_pct",
        "torque_converter_slip_speed",
    ],
    "gear_model": {
        "type": "6-speed sequential with hysteresis",
        "min_dwell_rows": 4,
        "rpm_per_kmh_per_gear": [65.0, 41.0, 27.0, 20.0, 16.0, 13.0],
        "gear_bands_upshift_kmh":   [16.0, 29.0, 47.0, 67.0, 83.0, 999.0],
        "gear_bands_downshift_kmh": [ 0.0, 12.0, 23.0, 40.0, 60.0,  74.0],
    },
    "rpm": {
        "idle_rpm": 720.0, "max_rpm": 2250.0,
        "noise_std": 35.0, "ar": 0.82,
        "formula": "max(idle, speed_kmh * gear_rpm_k[gear]) + AR1_noise",
    },
    "load_pct": {
        "base_idle": 0.15, "speed_coeff": 0.45,
        "accel_k": 25.0, "decel_k": 15.0,
        "noise_std": 4.0, "ar": 0.78,
        "formula": "(base + speed_frac * coeff) * 100 + accel_term - decel_term",
    },
    "tc_slip_rpm": {
        "cruise_max": 40.0, "load_scale": 200.0,
        "shift_peak": 720.0, "shift_decay": 0.55,
        "noise_std": 8.0,
        "formula": "cruise_slip + load_slip + post_shift_decay + noise",
    },
}

ENGINE = {
    "columns_fixed": ["engine_rpm_rpm", "engine_load_absolute"],
    "note": "Same speed backbone as transmission; separate RNG salts → slightly different noise",
}

# ── Fuel / Odometer (fix_vehicle_physics.py + fix_mileage.py) ──────────────────

FUEL = {
    "columns_fixed": ["fuel_level_pct"],
    "tank_litres": 200.0,
    "start_min_pct": 65.0, "start_max_pct": 90.0,
    "idle_lph": 2.8,
    "base_l100km": 12.0, "load_l100km": 10.0,
    "gap_maybe_s": 4 * 3600, "gap_always_s": 12 * 3600,
    "refuel_prob_at_4_12h_gap": 0.55,
    "refuel_min_frac": 0.20, "refuel_max_frac": 0.50,
    "floor_pct": 2.0,
}

ODOMETER = {
    "columns_fixed": ["odometer_reading"],
    "start_min_km": 25_000, "start_max_km": 140_000,
    "formula": "start + cumulative_km (speed * dt / 3600, gap-zeroed)",
    "note": "Gaps zeroed — no distance accrued during parked gaps",
}

# ── Battery (fix_battery_physics.py) ──────────────────────────────────────────

BATTERY = {
    "columns_fixed": [
        "battery_state_of_charge_soc_pct",
        "battery_state_of_health_soh_pct",
        "battery_temperature_cell",
        "battery_voltage_ecu_7ee",
    ],
    "system": "24V lead-acid (two 12V in series), diesel starter + accessories",
    "soc": {
        "start_min_pct": 85.0, "start_range_pct": 12.0,
        "ceiling_pct": 97.0, "floor_pct": 50.0,
        "charge_per_s": 0.0004, "idle_drain_per_s": 0.00011,
        "park_drain_per_h": 1.5,
        "formula": "charging: taper-limited charge at SOC_CHARGE_PER_S; parked: 1.5%/h drain",
    },
    "soh": {
        "min_pct": 72.0, "max_pct": 99.0,
        "drift_per_h": 0.0008,
        "formula": "linspace(base, base - drift*span_h, n_rows)",
    },
    "temp_c": {
        "ambient_min": 30.0, "ambient_range": 10.0,
        "charge_delta": 10.0, "tau_s": 1800.0,
        "noise_std": 0.5,
        "formula": "first-order lag toward ambient+(10 if charging else 0)",
    },
    "voltage_v": {
        "charging_mean": 28.2, "charging_std": 0.15, "charging_ar": 0.92,
        "rest_base_v": 23.0, "rest_range_v": 2.6,
        "rest_noise_std": 0.04,
        "formula": "if speed>0: AR1(28.2) clipped [27, 29.2] else: 23 + (SoC/100)*2.6",
        "caution": "If existing data shows ~14V, halve VOLT_* constants — single 12V battery",
    },
}

# ── Cabin (fix_cabin_physics.py) ──────────────────────────────────────────────

CABIN = {
    "columns_fixed": [
        "cabin_temperature",
        "cabin_humidity_pct",
        "ac_compressor_load_pct",
    ],
    "ambient": {
        "temp_min_c": 32.0, "temp_range_c": 10.0,
        "humidity_min_pct": 35.0, "humidity_range_pct": 37.0,
        "solar_gain_min_c": 4.0, "solar_gain_range_c": 4.0,
    },
    "ac_system": {
        "trucks_with_ac_prob": 0.80,
        "setpoint_min_c": 22.0, "setpoint_range_c": 4.0,
        "gain_per_degree": 6.0, "idle_load_pct": 10.0,
        "floor_pct": 5.0, "ar": 0.88, "noise_std": 2.5,
    },
    "thermal_model": {
        "tau_ac_s": 480.0,
        "tau_vent_s": 720.0,
        "tau_soak_s": 300.0,
        "temp_noise_std": 0.25,
        "formula": "first-order lag: cur += alpha*(target - cur); alpha=1-exp(-dt/tau)",
    },
    "humidity_model": {
        "dehumid_max_per_s": 0.04, "drift_tau_s": 900.0,
        "noise_std": 0.4, "floor_pct": 18.0, "ceiling_pct": 95.0,
        "formula": "AC dehumidifies at rate prop to compressor_load; drifts back to ambient otherwise",
    },
}

# ── Tyre (fix_tyre_physics.py) ─────────────────────────────────────────────────

TYRE = {
    "columns_fixed": [
        "tyre_pressure_fl_psi", "tyre_pressure_fr_psi",
        "tyre_pressure_rl_psi", "tyre_pressure_rr_psi",
        "tyre_temp_fl_c",       "tyre_temp_fr_c",
        "tyre_wear_fl_pct",     "tyre_wear_fr_pct",
        "tyre_wear_rl_pct",     "tyre_wear_rr_pct",
    ],
    "tyre_spec": "10.00R20 / 295-80R22.5  medium-heavy truck 10-14t GVW",
    "pressure_psi": {
        "front_nominal": 90.0, "rear_nominal": 105.0,
        "init_std": 4.5, "lr_imbalance_std": 1.8,
        "noise_std": 0.28, "temp_k_psi_per_degc": 0.22,
        "cold_ref_temp_c": 35.0,
        "formula": "cold_pressure + (temp - 35) * 0.22 + noise; RL/RR use FL/FR temp +6.3/+5.8",
    },
    "temp_c": {
        "ambient_min": 34.0, "ambient_range": 8.0,
        "delta_idle_c": 4.0, "delta_hwy_c": 28.0, "hwy_ref_kmh": 80.0,
        "tau_s": 900.0, "noise_std": 0.5, "lr_offset_std": 1.5,
        "formula": "first-order lag toward ambient+delta*(speed/80), reset on gap",
    },
    "wear_pct": {
        "front_init_range": [68.0, 97.0], "rear_init_range": [65.0, 96.0],
        "rate_front_pct_per_km": 0.0035, "rate_rear_pct_per_km": 0.0028,
        "noise_std": 0.04, "floor_pct": 15.0,
        "formula": "initial - rate * cumulative_km + noise (gap-zeroed distance)",
    },
}

# ── Fleet Simulator ────────────────────────────────────────────────────────────

FLEET_SIM = {
    "routes": [
        "delhi_lucknow", "delhi_jaipur", "delhi_chandigarh",
        "delhi_agra", "lucknow_varanasi", "jaipur_udaipur", "delhi_dehradun",
    ],
    "speed_by_road_type": {"highway": 82.0, "primary": 60.0, "urban": 22.0},
    "VehicleState_fields": [
        "vehicle_id", "route_key", "route", "position_index", "direction",
        "elapsed_km", "current_speed", "current_heading", "behavior",
        "event_markers", "last_update_time", "start_offset_km",
        "prev_speed", "ticks_since_event", "driver_aggression",
    ],
    "driver_aggression_range": [0.3, 0.9],
    "route_format": "JSON per route key: {coordinates: [[lat,lng],...], road_types: [...]}",
    "tick_model": "per-second update; position advances along route; wraps at end",
}

# ── Module → CSV pattern mapping ───────────────────────────────────────────────

MODULE_PATTERNS: dict[str, list[str]] = {
    "engine":       ["*engine*scenarioA*.csv",       "*engine*.csv"],
    "transmission": ["*transmission*scenarioA*.csv", "*transmission*.csv"],
    "battery":      ["*battery*scenarioA*.csv",      "*battery*.csv"],
    "body":         ["*body*scenarioA*.csv",          "*body*.csv"],
    "tyre":         ["*tyre*scenarioA*.csv",          "*tyre*.csv"],
}

TARGET_COLS: dict[str, list[str]] = {
    "engine":       list(ENGINE["columns_fixed"]),
    "transmission": list(TRANSMISSION["columns_fixed"]),
    "battery":      list(BATTERY["columns_fixed"]),
    "body":         list(FUEL["columns_fixed"]) + list(CABIN["columns_fixed"]) + [ODOMETER["columns_fixed"][0]],
    "tyre":         list(TYRE["columns_fixed"]),
}


# ─────────────────────────────────────────────────────────────────────────────
#  DATA AUDIT  (runs on whatever device has the CSVs)
# ─────────────────────────────────────────────────────────────────────────────

def find_csv(sim_dir: Path, module: str) -> Path | None:
    for pattern in MODULE_PATTERNS[module]:
        hits = sorted(sim_dir.glob(pattern))
        if hits:
            return hits[0]
    return None


def audit_csv(csv_path: Path, module: str) -> dict[str, Any]:
    if not _PANDAS:
        return {"error": "pandas not installed — install it to enable data audit"}
    try:
        df = pd.read_csv(csv_path, low_memory=False)
    except Exception as e:
        return {"error": str(e)}

    result: dict[str, Any] = {
        "file": csv_path.name,
        "rows": len(df),
        "columns": list(df.columns),
    }

    if "timestamp" not in df.columns:
        result["timestamp_error"] = "no timestamp column"
        return result

    ts = pd.to_datetime(df["timestamp"], utc=True, errors="coerce").dropna()
    if len(ts) < 2:
        result["timestamp_error"] = f"only {len(ts)} valid timestamps"
        return result

    dt_s_all   = ts.diff().dt.total_seconds().dropna()
    median_dt  = float(dt_s_all.median())
    gap_thr    = max(GAP_MULTIPLIER * median_dt, GAP_MIN_S)
    n_gaps     = int((dt_s_all > gap_thr).sum())

    result["timestamp"] = {
        "date_start":  str(ts.min())[:19],
        "date_end":    str(ts.max())[:19],
        "span_days":   round((ts.max() - ts.min()).total_seconds() / 86400.0, 2),
        "median_dt_s": round(median_dt, 3),
        "min_dt_s":    round(float(dt_s_all.min()), 3),
        "max_dt_s":    round(float(dt_s_all.max()), 2),
        "gap_threshold_s": round(gap_thr, 1),
        "n_gaps":      n_gaps,
        "n_trips":     n_gaps + 1,
    }

    col_stats: dict[str, Any] = {}
    for col in TARGET_COLS.get(module, []):
        if col not in df.columns:
            col_stats[col] = "MISSING"
            continue
        s = pd.to_numeric(df[col], errors="coerce").dropna()
        if s.empty:
            col_stats[col] = "ALL_NULL"
            continue
        col_stats[col] = {
            "min":  round(float(s.min()), 4),
            "mean": round(float(s.mean()), 4),
            "max":  round(float(s.max()), 4),
            "null_pct": round(df[col].isna().mean() * 100, 2),
        }

    result["target_col_stats"] = col_stats

    extra_cols = [c for c in df.columns if c not in TARGET_COLS.get(module, []) and c != "timestamp"]
    result["other_columns"] = extra_cols

    return result


def discover_and_audit(root: Path) -> dict[str, Any]:
    audit: dict[str, Any] = {}

    if not root.exists():
        return {"error": f"Root not found: {root}"}

    sim_dirs = sorted(d for d in root.iterdir() if d.is_dir())
    if not sim_dirs:
        return {"error": f"No subdirectories in {root}"}

    for sim_dir in sim_dirs:
        sim_id = sim_dir.name
        sim_audit: dict[str, Any] = {}
        for module in MODULE_PATTERNS:
            csv = find_csv(sim_dir, module)
            if csv is None:
                sim_audit[module] = {"error": "CSV not found"}
            else:
                sim_audit[module] = audit_csv(csv, module)
        audit[sim_id] = sim_audit

    return audit


# ─────────────────────────────────────────────────────────────────────────────
#  MARKDOWN GENERATION
# ─────────────────────────────────────────────────────────────────────────────

def _kv_block(data: dict, indent: int = 0) -> list[str]:
    lines = []
    pad = " " * indent
    for k, v in data.items():
        if isinstance(v, dict):
            lines.append(f"{pad}- **{k}**:")
            lines.extend(_kv_block(v, indent + 2))
        elif isinstance(v, list):
            lines.append(f"{pad}- **{k}**: `{', '.join(str(x) for x in v)}`")
        else:
            lines.append(f"{pad}- **{k}**: `{v}`")
    return lines


def _fmt_col_stats(stats: dict[str, Any]) -> list[str]:
    lines = []
    lines.append("")
    lines.append("| Column | Min | Mean | Max | Null% |")
    lines.append("|--------|-----|------|-----|-------|")
    for col, s in stats.items():
        if s == "MISSING":
            lines.append(f"| `{col}` | — | — | — | **MISSING** |")
        elif s == "ALL_NULL":
            lines.append(f"| `{col}` | — | — | — | 100% |")
        elif isinstance(s, dict):
            lines.append(f"| `{col}` | {s['min']} | {s['mean']} | {s['max']} | {s['null_pct']}% |")
    lines.append("")
    return lines


def build_markdown(audit: dict[str, Any], root: Path) -> str:
    lines: list[str] = []
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    # ── Header ────────────────────────────────────────────────────────────────
    lines += [
        "# Physics Audit & Algorithm Reference",
        "",
        f"Generated: **{now}**  |  Data root: `{root}`",
        "",
        "This document has three sections:",
        "1. **Algorithm Reference** — all constants and derivation logic from the fix_* scripts",
        "2. **Data Audit** — per-vehicle, per-module statistics from whatever CSVs were found",
        "3. **Expansion Blueprint** — plan for building 40 vehicles from 7 using date cuts",
        "",
        "When you run this script on the demo device, Section 2 will be filled with the real",
        "data statistics. Give the combined document back to Claude to continue the work.",
        "",
        "---",
        "",
    ]

    # ── Section 1: Algorithm Reference ────────────────────────────────────────
    lines += [
        "## 1. Algorithm Reference",
        "",
        "### 1.1 Shared Infrastructure",
        "",
        "#### Deterministic RNG",
        "```",
        "seed = sha256(f'{sim_id}:{salt}').digest()[:8]  →  np.random.default_rng(seed)",
        "Every signal is reproducible: same sim_id + same timestamps → identical output.",
        "New vehicles only need a new sim_id string.",
        "```",
        "",
        "#### Gap Detection (all scripts)",
        "```",
        f"median_dt   = median of consecutive timestamp differences (seconds)",
        f"gap_thr     = max(GAP_MULTIPLIER * median_dt, GAP_MIN_S)",
        f"              = max({GAP_MULTIPLIER} * median_dt, {GAP_MIN_S}s)",
        f"A gap is any dt_s > gap_thr — treated as a trip boundary (engine off/sleep).",
        f"Scripts auto-adapt: at 1s resolution median_dt=1 → gap_thr=300s (5 min).",
        "```",
        "",
        "#### Speed Backbone (AR1 + EMA + ramp)",
        "```",
        "noise_std = std * sqrt(1 - ar²)   ← drives AR1 innovation",
        "AR1:   x[i] = ar * x[i-1] + (1-ar) * mean + N(0, noise_std)",
        "EMA:   y[i] = alpha * x[i] + (1-alpha) * y[i-1]",
        "Ramp:  scale first/last N rows linearly from 0 (trip start/end)",
        "```",
        "",
        "| Profile | mean | std | AR | max | EMA alpha | ramp rows |",
        "|---------|------|-----|----|-----|-----------|-----------|",
    ]
    u = SPEED["urban"]
    h = SPEED["highway"]
    lines.append(f"| Urban   | {u['mean_kmh']} km/h | {u['std_kmh']} | {u['ar']} | {u['max_kmh']} | {u['ema_alpha']} | {u['ramp_rows']} |")
    lines.append(f"| Highway | {h['mean_kmh']} km/h | {h['std_kmh']} | {h['ar']} | {h['max_kmh']} | {h['ema_alpha']} | {h['ramp_rows']} |")
    lines += [
        "",
        f"Urban stop injection: p={u['stop_prob']} per row, duration={u['stop_min_s']}–{u['stop_max_s']}s",
        f"Highway slowdown:     p={h['slowdown_prob']} per row, target 35–55 km/h for {h['slowdown_min_s']}–{h['slowdown_max_s']}s",
        f"Trip mode: {int(SPEED['urban_trip_prob']*100)}% urban, {int((1-SPEED['urban_trip_prob'])*100)}% highway (seeded per-trip)",
        "",
    ]

    # Transmission
    lines += [
        "### 1.2 Transmission & Engine (`fix_vehicle_physics.py`)",
        "",
        f"Columns: `{', '.join(TRANSMISSION['columns_fixed'])}`",
        "",
        "#### Gear state machine",
        "",
        "| Gear | Upshift (km/h) | Downshift (km/h) | RPM/km/h |",
        "|------|---------------|-----------------|----------|",
    ]
    for g in range(6):
        up = TRANSMISSION["gear_model"]["gear_bands_upshift_kmh"][g]
        dn = TRANSMISSION["gear_model"]["gear_bands_downshift_kmh"][g]
        rk = TRANSMISSION["gear_model"]["rpm_per_kmh_per_gear"][g]
        lines.append(f"| {g+1} | {up} | {dn} | {rk} |")
    lines += [
        "",
        f"Min dwell: {TRANSMISSION['gear_model']['min_dwell_rows']} rows before shift allowed.",
        "",
        "#### RPM",
        "```",
        f"nominal[i] = max({TRANSMISSION['rpm']['idle_rpm']}, speed[i] * gear_rpm_k[gear[i]])",
        f"AR1: ar={TRANSMISSION['rpm']['ar']}, noise_std={TRANSMISSION['rpm']['noise_std']}, clip=[{TRANSMISSION['rpm']['idle_rpm']}, 2250]",
        "```",
        "",
        "#### Engine Load (%)",
        "```",
        f"base   = {TRANSMISSION['load_pct']['base_idle']} + (speed / {h['max_kmh']}) * {TRANSMISSION['load_pct']['speed_coeff']}",
        f"accel  = clip(Δspeed/dt, 0, ∞) * {TRANSMISSION['load_pct']['accel_k']}",
        f"decel  = clip(-Δspeed/dt, 0, ∞) * {TRANSMISSION['load_pct']['decel_k']}",
        f"AR1: ar={TRANSMISSION['load_pct']['ar']}, noise_std={TRANSMISSION['load_pct']['noise_std']}, clip=[5, 97]",
        "```",
        "",
        "#### TC Slip (RPM)",
        "```",
        f"cruise_slip = {TRANSMISSION['tc_slip_rpm']['cruise_max']} * (load/100)",
        f"load_slip   = {TRANSMISSION['tc_slip_rpm']['load_scale']} * max(0, (load_frac - 0.40) / 0.60)",
        f"shift_peak  = {TRANSMISSION['tc_slip_rpm']['shift_peak']} immediately post-shift, decays * {TRANSMISSION['tc_slip_rpm']['shift_decay']} per row",
        "```",
        "",
        f"Engine (`fix_vehicle_physics.py`): columns `{', '.join(ENGINE['columns_fixed'])}` — same speed backbone, separate RNG salts.",
        "",
    ]

    # Fuel / Odometer
    lines += [
        "### 1.3 Fuel & Odometer",
        "",
        f"**Fuel** — column: `fuel_level_pct` | Tank: {FUEL['tank_litres']} L",
        "```",
        f"Start: {FUEL['start_min_pct']}–{FUEL['start_max_pct']}% (per-sim seed)",
        f"Idle consumption:  {FUEL['idle_lph']} L/h",
        f"Driving:           ({FUEL['base_l100km']} + load_frac * {FUEL['load_l100km']}) L/100km",
        f"Refuel at gap:     >{FUEL['gap_maybe_s']//3600}h → p={FUEL['refuel_prob_at_4_12h_gap']} of refuelling",
        f"                   >{FUEL['gap_always_s']//3600}h → always refuel",
        f"Refuel amount:     {FUEL['refuel_min_frac']*100:.0f}–{FUEL['refuel_max_frac']*100:.0f}% of tank",
        "```",
        "",
        f"**Odometer** — column: `odometer_reading`",
        "```",
        f"Start: {ODOMETER['start_min_km']:,}–{ODOMETER['start_max_km']:,} km (per-sim seed)",
        f"km += speed_kmh * dt_s / 3600  (zeroed during gaps)",
        "```",
        "",
    ]

    # Battery
    lines += [
        "### 1.4 Battery (`fix_battery_physics.py`)",
        "",
        f"**System**: {BATTERY['system']}",
        f"Columns: `{', '.join(BATTERY['columns_fixed'])}`",
        "",
        "| Signal | Formula summary | Range |",
        "|--------|----------------|-------|",
        f"| SoC (%) | Charge {BATTERY['soc']['charge_per_s']*1000:.2f}‰/s while moving; park drain {BATTERY['soc']['park_drain_per_h']}%/h | [{BATTERY['soc']['floor_pct']}, {BATTERY['soc']['ceiling_pct']}] |",
        f"| SoH (%) | linspace fade, {BATTERY['soh']['drift_per_h']} %/h | [{BATTERY['soh']['min_pct']}, {BATTERY['soh']['max_pct']}] |",
        f"| Temp (C) | lag toward ambient+{BATTERY['temp_c']['charge_delta']}°C if charging, τ={BATTERY['temp_c']['tau_s']}s | [20, 65] |",
        f"| Voltage (V) | charging: AR1({BATTERY['voltage_v']['charging_mean']}V); resting: {BATTERY['voltage_v']['rest_base_v']}+(SoC/100)*{BATTERY['voltage_v']['rest_range_v']} | [22.5, 29.2] |",
        "",
        f"> ⚠️  {BATTERY['voltage_v']['caution']}",
        "",
    ]

    # Cabin
    lines += [
        "### 1.5 Cabin (`fix_cabin_physics.py`)",
        "",
        f"Columns: `{', '.join(CABIN['columns_fixed'])}`",
        "",
        f"Ambient: {CABIN['ambient']['temp_min_c']}–{CABIN['ambient']['temp_min_c']+CABIN['ambient']['temp_range_c']}°C, "
        f"RH {CABIN['ambient']['humidity_min_pct']}–{CABIN['ambient']['humidity_min_pct']+CABIN['ambient']['humidity_range_pct']}%",
        f"AC trucks: {int(CABIN['ac_system']['trucks_with_ac_prob']*100)}% of fleet | Setpoint: {CABIN['ac_system']['setpoint_min_c']}–{CABIN['ac_system']['setpoint_min_c']+CABIN['ac_system']['setpoint_range_c']}°C",
        "",
        "```",
        "thermal lag:  cur += (1 - exp(-dt/tau)) * (target - cur)",
        f"  tau_ac    = {CABIN['thermal_model']['tau_ac_s']}s  (AC cooling ~8 min)",
        f"  tau_vent  = {CABIN['thermal_model']['tau_vent_s']}s  (ventilation only)",
        f"  tau_soak  = {CABIN['thermal_model']['tau_soak_s']}s  (parked, cabin heating)",
        f"humidity: dehumid at ≤{CABIN['humidity_model']['dehumid_max_per_s']:.2f}%/s, drifts back τ={CABIN['humidity_model']['drift_tau_s']}s",
        "```",
        "",
    ]

    # Tyre
    lines += [
        "### 1.6 Tyre (`fix_tyre_physics.py`)",
        "",
        f"Spec: {TYRE['tyre_spec']}",
        f"Columns: `{', '.join(TYRE['columns_fixed'])}`",
        "",
        "| Signal | Nominal | Formula |",
        "|--------|---------|---------|",
        f"| FL/FR pressure (PSI) | {TYRE['pressure_psi']['front_nominal']} cold | cold + (temp-{TYRE['pressure_psi']['cold_ref_temp_c']})*{TYRE['pressure_psi']['temp_k_psi_per_degc']} + noise |",
        f"| RL/RR pressure (PSI) | {TYRE['pressure_psi']['rear_nominal']} cold | RL=FL_temp+6.3, RR=FR_temp+5.8 |",
        f"| FL/FR temp (°C) | {TYRE['temp_c']['ambient_min']}–{TYRE['temp_c']['ambient_min']+TYRE['temp_c']['ambient_range']}+{TYRE['temp_c']['delta_hwy_c']} | lag toward ambient+Δ(speed/{TYRE['temp_c']['hwy_ref_kmh']}), τ={TYRE['temp_c']['tau_s']}s |",
        f"| FL/FR wear (%) | {TYRE['wear_pct']['front_init_range'][0]}–{TYRE['wear_pct']['front_init_range'][1]} start | initial - {TYRE['wear_pct']['rate_front_pct_per_km']}%/km (front), floor={TYRE['wear_pct']['floor_pct']}% |",
        f"| RL/RR wear (%) | {TYRE['wear_pct']['rear_init_range'][0]}–{TYRE['wear_pct']['rear_init_range'][1]} start | initial - {TYRE['wear_pct']['rate_rear_pct_per_km']}%/km (rear) |",
        "",
    ]

    # Fleet Sim
    lines += [
        "### 1.7 Fleet Simulator (`trip_engine.py`, `route_data.py`)",
        "",
        f"Routes: `{', '.join(FLEET_SIM['routes'])}`",
        "",
        "| Road type | Speed target |",
        "|-----------|-------------|",
    ]
    for k, v in FLEET_SIM["speed_by_road_type"].items():
        lines.append(f"| {k} | {v} km/h |")
    lines += [
        "",
        f"Driver aggression: uniform [{FLEET_SIM['driver_aggression_range'][0]}, {FLEET_SIM['driver_aggression_range'][1]}] per vehicle",
        f"Route format: `routes/<key>.json` → `{{coordinates: [[lat,lng]], road_types: [...]}}`",
        "",
        "---",
        "",
    ]

    # ── Section 2: Data Audit ──────────────────────────────────────────────────
    lines += [
        "## 2. Data Audit",
        "",
        f"Data root scanned: `{root}`",
        "",
    ]

    if "error" in audit:
        lines += [f"> ⚠️  {audit['error']}", ""]
    elif not audit:
        lines += ["> No vehicles found.", ""]
    else:
        lines += [
            f"Vehicles found: **{len(audit)}** — `{', '.join(audit.keys())}`",
            "",
        ]
        for sim_id, sim_data in audit.items():
            lines += [f"### 2.{list(audit.keys()).index(sim_id)+1} {sim_id}", ""]
            for module, mdata in sim_data.items():
                lines.append(f"#### Module: `{module}`")
                if "error" in mdata:
                    lines.append(f"> {mdata['error']}")
                    lines.append("")
                    continue
                lines.append(f"File: `{mdata.get('file', '?')}` | Rows: **{mdata.get('rows', '?'):,}**")
                if "timestamp_error" in mdata:
                    lines.append(f"> Timestamp issue: {mdata['timestamp_error']}")
                elif "timestamp" in mdata:
                    ts = mdata["timestamp"]
                    lines += [
                        "",
                        f"| span | start | end | median_dt | gap_thr | n_trips |",
                        f"|------|-------|-----|-----------|---------|---------|",
                        f"| {ts['span_days']}d | {ts['date_start']} | {ts['date_end']} | {ts['median_dt_s']}s | {ts['gap_threshold_s']}s | {ts['n_trips']} |",
                        "",
                    ]
                if "target_col_stats" in mdata and mdata["target_col_stats"]:
                    lines += _fmt_col_stats(mdata["target_col_stats"])
                if mdata.get("other_columns"):
                    other = mdata["other_columns"]
                    lines.append(f"Other columns ({len(other)}): `{', '.join(other[:20])}{'…' if len(other) > 20 else ''}`")
                lines.append("")

    lines += ["---", ""]

    # ── Section 3: Expansion Blueprint ────────────────────────────────────────
    lines += [
        "## 3. Expansion Blueprint: 7 → 40 Vehicles",
        "",
        "### 3.1 Current State",
        "- 7 real vehicle CSVs, each with 5 module files",
        "- Each vehicle has a `sim_id` (e.g. `sim001`, `sim002`)",
        "- All fix_* scripts are deterministic on `sim_id`",
        "- Scripts accept `--root` flag for running on any device",
        "",
        "### 3.2 Date-Cut Strategy",
        "```",
        "Each real vehicle has N days of 1s-resolution data.",
        "Cut strategy: split each vehicle's CSV into multiple non-overlapping date windows.",
        "",
        "Example with 7 vehicles × 5 cuts = 35 new vehicles (+ 5 more from overlap):",
        "  sim001_A: 2025-01-01 to 2025-01-14   (new sim_id = 'v001a')",
        "  sim001_B: 2025-01-15 to 2025-01-28   (new sim_id = 'v001b')",
        "  ...etc",
        "",
        "The cut script:",
        "  1. Reads original CSV",
        "  2. Filters by date range",
        "  3. Writes to data/vehicles/<new_sim_id>/<original_filename>",
        "  4. fix_* scripts run on the new directory with the new sim_id",
        "     → different RNG seed → different gear noise, different tyre wear start, etc.",
        "     but same physical relationships (speed drives everything)",
        "```",
        "",
        "### 3.3 New sim_id Naming Convention",
        "```",
        "Original: sim001 … sim007",
        "Cuts:     v01a, v01b, v01c, v01d, v01e",
        "          v02a, v02b, v02c, v02d, v02e",
        "          ...  (7 × 5 = 35) + 5 from partial cuts = 40",
        "",
        "RNG guarantee: sha256('v01a:fuel_start') ≠ sha256('v01b:fuel_start')",
        "→ each cut vehicle gets fully independent starting conditions.",
        "```",
        "",
        "### 3.4 What the Cut Script Needs to Know",
        "Provide in the next session:",
        "- [ ] Exact column name for timestamp",
        "- [ ] Date range available per vehicle",
        "- [ ] Whether all 7 vehicles have the same date range",
        "- [ ] Target number of vehicles (confirming 40)",
        "- [ ] Directory structure of the bigger data (flat or nested?)",
        "- [ ] Whether module CSVs are in sub-folders or same folder per vehicle",
        "",
        "### 3.5 Script to Write Next",
        "```",
        "expand_vehicles.py  --source-root <demo_data>  --out-root <new_data>",
        "  --n-cuts 5          # cuts per vehicle",
        "  --window-days 14    # or auto-computed from date range",
        "  --yes               # skip confirmation",
        "",
        "After running, execute fix_* scripts on new root:",
        "  python fix_vehicle_physics.py --root <new_data>  --yes",
        "  python fix_battery_physics.py --root <new_data>  --yes",
        "  python fix_cabin_physics.py   --root <new_data>  --yes",
        "  python fix_tyre_physics.py    --root <new_data>  --yes",
        "  python fix_mileage.py         --root <new_data>  --yes",
        "```",
        "",
        "---",
        "",
        "## 4. Fill-in Section (Demo Device)",
        "",
        "When running on the demo device, Section 2 above will be auto-filled.",
        "Additionally, please manually note:",
        "",
        "```",
        "Demo device OS          : ___",
        "Python version          : ___",
        "Data root path          : ___",
        "Total vehicles          : ___",
        "Approx rows per vehicle : ___",
        "Date range              : ___ to ___",
        "Timestamp column name   : ___",
        "Timestamp format        : ___  (e.g. '2025-01-01 00:00:01+00:00' or unix seconds)",
        "Row interval (confirm)  : ___ seconds",
        "Source_id column        : ___  (or is it embedded in filename?)",
        "Module CSV location     : inside sim folder / separate folders / flat",
        "Any columns MISSING from fix_* target list (not in real data): ___",
        "Any columns in real data not in fix_* scripts (new signals):   ___",
        "```",
        "",
    ]

    return "\n".join(lines)


# ─────────────────────────────────────────────────────────────────────────────
#  ENTRY POINT
# ─────────────────────────────────────────────────────────────────────────────

def main() -> None:
    args = sys.argv[1:]

    root = VEHICLES_ROOT
    if "--root" in args:
        idx = args.index("--root")
        if idx + 1 < len(args):
            root = Path(args[idx + 1])
        else:
            print("[ERROR] --root requires a path argument")
            sys.exit(1)

    print(f"Scanning: {root}")
    audit = discover_and_audit(root)

    n_vehicles = len([k for k in audit if k != "error"])
    print(f"Found {n_vehicles} vehicle(s)")

    md = build_markdown(audit, root)

    OUTPUT_MD.write_text(md, encoding="utf-8")
    print(f"\nWritten → {OUTPUT_MD}")
    print(f"Size    : {len(md):,} chars  ({OUTPUT_MD.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
