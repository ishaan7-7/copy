
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
