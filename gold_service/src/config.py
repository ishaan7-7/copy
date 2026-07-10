import os

# --- BASE PATHS ---
GOLD_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT_DIR = os.path.dirname(GOLD_DIR)

SILVER_DIR = os.path.join(ROOT_DIR, "data", "delta", "silver")
GOLD_TABLE_DIR = os.path.join(ROOT_DIR, "data", "delta", "gold", "vehicle_health")
STATE_DIR = os.path.join(GOLD_DIR, "state")

os.makedirs(STATE_DIR, exist_ok=True)
os.makedirs(os.path.join(ROOT_DIR, "data", "delta", "gold"), exist_ok=True)

CHECKPOINT_FILE = os.path.join(STATE_DIR, "checkpoints.json")
CACHE_FILE = os.path.join(STATE_DIR, "vehicle_cache.pkl")

# --- PROCESSING PARAMETERS ---
POLL_INTERVAL = 2.0
BATCH_SIZE = 50
AGGREGATION_WINDOW_SEC = 1

import json as _json, pathlib as _pl
_pipeline_cfg = _json.loads((_pl.Path(__file__).resolve().parents[2] / "config" / "pipeline_config.json").read_text())

ENABLED_MODULES  = _pipeline_cfg["enabled_modules"]
RAW_WEIGHTS      = {m: _pipeline_cfg["module_weights"].get(m, 0.0) for m in ENABLED_MODULES}
TIER_1_PENALTIES = _pipeline_cfg["tier_1_penalties"]

# --- SMART AUTO-NORMALIZATION ENGINE ---
# Filter weights to only include enabled modules
_active_weights = {m: RAW_WEIGHTS.get(m, 0.0) for m in ENABLED_MODULES}
_total_weight = sum(_active_weights.values())

if _total_weight <= 0:
    raise ValueError("Sum of enabled module weights must be greater than 0.")

# Normalize weights so they perfectly equal 1.0 while preserving preference ratios
NORMALIZED_WEIGHTS = {m: (w / _total_weight) for m, w in _active_weights.items()}

HEALTH_DISPLAY_FLOOR = {
    "engine": 70,
    "transmission": 85,
    "battery": 95,
    "body": 95,
    "tyre": 95,
}
# Print startup calibration for logging
print(f"⚙️ Configured Weights Normalized to 1.0: { {k: round(v, 4) for k, v in NORMALIZED_WEIGHTS.items()} }")
print(f"⚙️ Health Display Floor: {HEALTH_DISPLAY_FLOOR}%")