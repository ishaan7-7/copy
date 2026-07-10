import os
import sys
import json
import asyncio
import pandas as pd
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# --- Paths & Constants ---
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(CURRENT_DIR, ".."))
SILVER_ROOT = os.path.join(PROJECT_ROOT, "data", "delta", "silver")
ALERTS_ROOT = os.path.join(PROJECT_ROOT, "data", "delta", "gold", "alerts")
ALERTS_CHECKPOINT = os.path.join(CURRENT_DIR, "state", "checkpoints.json")
DTC_HISTORY_FILE = os.path.join(PROJECT_ROOT, "data", "dtc_history.json")

if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)
from common import duck_reader as dr

VEHICLE_MODULES = ["engine", "transmission", "battery", "body", "tyre"]

# --- Utils ---
def safe_read_json(file_path):
    try:
        if os.path.exists(file_path):
            with open(file_path, "r") as f:
                return json.load(f)
    except Exception:
        pass
    return None

# --- Cache ---
ALERTS_METRICS_CACHE = {
    "active_alerts_count": 0,
    "critical_vehicles": 0,
    "processing_lag": 0,
    "open_alerts": [],
    "closed_alerts": []
}

# --- App Definition ---
app = FastAPI(title="Alerts Service Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Background Logic ---
_last_alerts_mtime = 0.0

def _sync_update_alerts():
    global ALERTS_METRICS_CACHE, _last_alerts_mtime
    try:
        current_mtime = 0.0
        if os.path.exists(ALERTS_ROOT):
            for entry in os.scandir(ALERTS_ROOT):
                if entry.is_file() and entry.name.endswith(".parquet"):
                    mt = entry.stat().st_mtime
                    if mt > current_mtime:
                        current_mtime = mt

        if current_mtime > 0 and current_mtime <= _last_alerts_mtime:
            return
        _last_alerts_mtime = current_mtime

        lag_rows = 0
        try:
            ckpt = safe_read_json(ALERTS_CHECKPOINT) or {}
            primary_mod = VEHICLE_MODULES[0]
            last_ts = ckpt.get(primary_mod, "1970-01-01T00:00:00")
            silver_primary = os.path.join(SILVER_ROOT, primary_mod)
            s_files = dr.list_files(silver_primary, max_files=3)
            if s_files:
                sdf = dr.query_df("SELECT inference_ts FROM read_parquet(?)", s_files)
                if not sdf.empty and "inference_ts" in sdf.columns:
                    sdf["inference_ts"] = pd.to_datetime(sdf["inference_ts"], utc=True)
                    lag_rows = int((sdf["inference_ts"] > pd.to_datetime(last_ts, utc=True)).sum())
        except:
            pass

        afiles = dr.list_files(ALERTS_ROOT, max_files=10)
        df_alerts = dr.query_df("SELECT * FROM read_parquet(?)", afiles) if afiles else pd.DataFrame()

        active_alerts = 0
        crit_vehicles = 0
        open_alerts = []
        closed_alerts = []

        if not df_alerts.empty:
            # Upsert-style data (same alert_id rewritten on every status
            # transition) — dedup before counting/displaying, otherwise a
            # single alert that's been updated N times shows as N alerts.
            if "alert_id" in df_alerts.columns and "last_updated_ts" in df_alerts.columns:
                df_alerts = (
                    df_alerts.sort_values("last_updated_ts")
                    .drop_duplicates(subset=["alert_id"], keep="last")
                )
            df_alerts = df_alerts.fillna(0)
            for col in df_alerts.select_dtypes(include=['datetime64[ns]', 'datetime64[ns, UTC]']).columns:
                df_alerts[col] = df_alerts[col].astype(str)

            df_alerts = df_alerts.sort_values('peak_anomaly_ts', ascending=False).head(50)
            open_df = df_alerts[df_alerts['status'] == "OPEN"]
            closed_df = df_alerts[df_alerts['status'] == "CLOSED"]

            active_alerts = len(open_df)
            crit_vehicles = open_df['source_id'].nunique() if not open_df.empty else 0
            dtc_lookup = {}
            try:
                if os.path.exists(DTC_HISTORY_FILE):
                    with open(DTC_HISTORY_FILE, "r") as _fh:
                        _runs = json.load(_fh)
                    for _r in _runs:
                        _norm = str(_r.get("peak_ts", ""))[:16].replace(" ", "T")
                        _k = (
                            str(_r.get("source_id", "")).lower(),
                            str(_r.get("module", "")).lower(),
                            _norm,
                        )
                        dtc_lookup[_k] = _r
            except Exception:
                pass

            def _enrich(alert: dict) -> dict:
                _norm = str(alert.get("peak_anomaly_ts", ""))[:16].replace(" ", "T")
                _k = (
                    str(alert.get("source_id", "")).lower(),
                    str(alert.get("module", "")).lower(),
                    _norm,
                )
                _run = dtc_lookup.get(_k)
                alert["analyzed"] = _run is not None
                alert["dtc_run_ts"] = _run["run_ts"] if _run else None
                alert["dtc_triggers"] = _run["triggers"] if _run else None
                return alert

            open_alerts = [_enrich(a) for a in open_df.to_dict(orient="records")]
            closed_alerts = [_enrich(a) for a in closed_df.to_dict(orient="records")]

        ALERTS_METRICS_CACHE["active_alerts_count"] = active_alerts
        ALERTS_METRICS_CACHE["critical_vehicles"] = crit_vehicles
        ALERTS_METRICS_CACHE["processing_lag"] = lag_rows
        ALERTS_METRICS_CACHE["open_alerts"] = open_alerts
        ALERTS_METRICS_CACHE["closed_alerts"] = closed_alerts

    except Exception as e:
        print(f"Alerts metrics loop failed: {e}")

async def update_alerts_metrics_loop():
    while True:
        await asyncio.to_thread(_sync_update_alerts)
        await asyncio.sleep(5)

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(update_alerts_metrics_loop())

# --- Endpoints ---
@app.get("/api/alerts/metrics")
def get_alerts_metrics():
    return ALERTS_METRICS_CACHE

if __name__ == "__main__":
    import uvicorn
    # Alerts & DTC runs on port 8004
    uvicorn.run("api:app", host="127.0.0.1", port=8004, reload=True)