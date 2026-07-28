import os
import json
from pathlib import Path

# Resolve the project root dynamically
# Logic: This file is in .../DTC/src/, so we go up 3 levels to get to project root
BASE_DIR = Path(__file__).resolve().parent.parent.parent

# Define System Paths
DTC_ROOT = BASE_DIR / "DTC"
CONTRACTS_DIR = BASE_DIR / "contracts"
DATA_DIR = BASE_DIR / "data" / "vehicles"

# DTC Sub-directories
ARTIFACTS_DIR = DTC_ROOT / "artifacts"
SYNTH_DATA_DIR = DTC_ROOT / "synth_data"

# Source of Truth
DTC_MASTER_PATH = CONTRACTS_DIR / "DTC_master.json"

def load_dtc_master():
    if not DTC_MASTER_PATH.exists():
        raise FileNotFoundError(f"DTC Master contract missing at: {DTC_MASTER_PATH}")
    
    with open(DTC_MASTER_PATH, 'r') as f:
        return json.load(f)

def get_dtc_config(module_name, dtc_code):
    master = load_dtc_master()
    
    if "modules" not in master:
        raise ValueError("Invalid Master JSON: 'modules' key missing")
        
    if module_name not in master["modules"]:
        raise ValueError(f"Module '{module_name}' not defined in Master Contract")
    
    dtc_list = master["modules"][module_name]
    for dtc in dtc_list:
        if dtc['dtc_code'] == dtc_code:
            return dtc
            
    raise ValueError(f"DTC '{dtc_code}' not found in module '{module_name}'")

# battery/P0562 and tyre/C0077's trained scaler+classifier were calibrated
# against pre-fix sensor ranges (12V battery system, ~36 PSI tyres — see
# inference_service/src/config.py's EXCLUDED_ERROR_FEATURES for the full
# context) that tools/fix_battery_physics.py and tools/fix_tyre_physics.py
# corrected on 2026-07-21, three weeks after these artifacts were trained.
# Feeding the now-correct (24V system / 90-105 PSI) raw values through those
# frozen models produces meaningless, wildly out-of-distribution scores, so
# these two specific codes bypass the ML model entirely in favor of a plain
# physically-grounded threshold on the already-corrected raw signal. Every
# other DTC code is unaffected and continues through the normal ML path.
PHYSICAL_THRESHOLD_OVERRIDES = {
    ("battery", "P0562"): {
        # 24V truck system resting baseline ~23V (fix_battery_physics.py);
        # a sustained drop below 20V is a genuine low-voltage fault.
        "columns": ["battery_voltage_ecu_7ee"],
        "direction": "below",
        "threshold": 20.0,
    },
    ("tyre", "C0077"): {
        # Heavy-truck nominal is 90/105 PSI (fix_tyre_physics.py); below 50
        # PSI on any wheel is severe under-inflation / blowout risk.
        "columns": [
            "tyre_pressure_fl_psi", "tyre_pressure_fr_psi",
            "tyre_pressure_rl_psi", "tyre_pressure_rr_psi",
        ],
        "direction": "below",
        "threshold": 50.0,
    },
}


def ensure_dirs(module_name, dtc_code=None):
    # Ensure Synth Data Directory exists
    synth_path = SYNTH_DATA_DIR / module_name
    synth_path.mkdir(parents=True, exist_ok=True)
    
    artifact_path = None
    if dtc_code:
        # Ensure Artifact Directory exists (e.g., artifacts/engine/P0217)
        artifact_path = ARTIFACTS_DIR / module_name / dtc_code
        artifact_path.mkdir(parents=True, exist_ok=True)
        
    return synth_path, artifact_path