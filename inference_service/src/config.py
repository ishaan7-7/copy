
import os

# Base paths
INFERENCE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT_DIR = os.path.dirname(INFERENCE_DIR)

# Data paths (Delta Tables)
BRONZE_DIR = os.path.join(ROOT_DIR, "data", "delta", "bronze")
SILVER_DIR = os.path.join(ROOT_DIR, "data", "delta", "silver")

# Inference Paths
ARTIFACTS_DIR = os.path.join(INFERENCE_DIR, "artifacts")
STATE_DIR = os.path.join(INFERENCE_DIR, "state")

os.makedirs(STATE_DIR, exist_ok=True)

# State Files
CHECKPOINT_FILE = os.path.join(STATE_DIR, "checkpoints.json")
ML_STATE_FILE = os.path.join(STATE_DIR, "ml_state.pkl")
ALERTS_FILE = os.path.join(STATE_DIR, "system_alerts.json")

# ML & Streaming Config
import json as _json, pathlib as _pl
MODULES = _json.loads((_pl.Path(__file__).resolve().parents[2] / "config" / "pipeline_config.json").read_text())["enabled_modules"]
BATCH_SIZE = 60
POLL_INTERVAL = 2.0
EMA_ALPHA = 0.2
PERSISTENCE_LIMIT = 5

# Columns whose raw value ranges were corrected by tools/fix_battery_physics.py
# and tools/fix_tyre_physics.py (2026-07-21) AFTER the LSTM/GMM artifacts under
# artifacts/{module}/ were trained (2026-06-29) — battery_voltage_ecu_7ee moved
# from a 12V to a 24V system baseline, and tyre pressure/wear moved to
# heavy-truck nominal ranges. The frozen models' scaler/feature_means still
# reflect the old, now-incorrect distributions, so these columns' reconstruction
# error is excluded from composite_score/health_score/severity and from
# top-feature (top_anomaly_driver) ranking until the artifacts are retrained on
# the corrected data. Retraining is tracked separately, post-demo.
EXCLUDED_ERROR_FEATURES = {
    "battery": ["battery_voltage_ecu_7ee"],
    "tyre": [
        "tyre_pressure_fl_psi", "tyre_pressure_fr_psi",
        "tyre_pressure_rl_psi", "tyre_pressure_rr_psi",
        "tyre_wear_fl_pct", "tyre_wear_fr_pct",
        "tyre_wear_rl_pct", "tyre_wear_rr_pct",
    ],
}
