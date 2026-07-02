import os
import sys
import json
import asyncio
import pandas as pd
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# --- Paths & Constants ---
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(CURRENT_DIR, ".."))
SILVER_ROOT = os.path.join(PROJECT_ROOT, "data", "delta", "silver")
STATE_DIR = os.path.join(CURRENT_DIR, "state")

if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)
from common import duck_reader as dr

VEHICLE_MODULES = ["battery", "body", "engine", "transmission", "tyre"]

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
INFERENCE_METRICS_CACHE = {
    "active_sims": 0,
    "active_modules": 0,
    "global_e2e_ms": 0,
    "global_inf_ms": 0,
    "module_stats": {},
    "recent_alerts": []
}
_last_silver_mtime = 0.0

# --- App Definition ---
app = FastAPI(title="Inference Service Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Background Logic ---
def _sync_update_metrics():
    global INFERENCE_METRICS_CACHE, _last_silver_mtime
    try:
        current_mtime = 0.0
        for mod in VEHICLE_MODULES:
            p = os.path.join(SILVER_ROOT, mod)
            if not os.path.exists(p):
                continue
            try:
                for entry in os.scandir(p):
                    if entry.is_file() and entry.name.endswith(".parquet"):
                        mt = entry.stat().st_mtime
                        if mt > current_mtime:
                            current_mtime = mt
            except Exception:
                pass
        if current_mtime > 0 and current_mtime <= _last_silver_mtime:
            return
        _last_silver_mtime = current_mtime
        # 1. Load System Alerts
        all_alerts = []
        for mod in VEHICLE_MODULES:
            alerts_file = os.path.join(STATE_DIR, f"system_alerts_{mod}.json")
            alerts = safe_read_json(alerts_file)
            if alerts:
                all_alerts.extend(alerts)

        # 2. Determine "Virtual Now" to handle offline viewing
        latest_ts = pd.Timestamp("1970-01-01", tz="UTC")
        for a in all_alerts:
            try:
                ts = pd.to_datetime(a['timestamp'], utc=True)
                if ts > latest_ts: latest_ts = ts
            except: pass

        _metric_cols = ["inference_ts", "ingest_ts", "writer_ts", "source_id", "severity", "health_score"]
        dfs_by_mod = {}
        mod_latest_ts = {}
        for mod in VEHICLE_MODULES:
            path = os.path.join(SILVER_ROOT, mod)
            if not os.path.exists(path): continue

            files = dr.list_files(path, max_files=3)
            if not files:
                continue
            col_sql = ", ".join(_metric_cols)
            df = dr.query_df(f"SELECT {col_sql} FROM read_parquet(?)", files)
            if not df.empty and "inference_ts" in df.columns:
                df["inference_ts"] = pd.to_datetime(df["inference_ts"], utc=True)
                mod_max = df["inference_ts"].max()
                if mod_max > latest_ts:
                    latest_ts = mod_max
                dfs_by_mod[mod] = df
                mod_latest_ts[mod] = mod_max

        recent_alerts = []
        global_cutoff = latest_ts - pd.Timedelta(minutes=5)
        for a in all_alerts:
            try:
                if pd.to_datetime(a['timestamp'], utc=True) >= global_cutoff:
                    recent_alerts.append(a)
            except: pass
        recent_alerts.sort(key=lambda x: x['timestamp'], reverse=True)

        # 3. Compute Silver Metrics
        sims = set()
        module_stats = {}
        e2e_list = []
        inf_list = []

        for mod, combined_df in dfs_by_mod.items():
            mod_cutoff = mod_latest_ts.get(mod, latest_ts) - pd.Timedelta(minutes=5)
            combined_df = combined_df[combined_df['inference_ts'] >= mod_cutoff]
            if combined_df.empty: continue

            combined_df['ingest_ts'] = pd.to_datetime(combined_df.get('ingest_ts', pd.NaT), utc=True)
            e2e = (combined_df['inference_ts'] - combined_df['ingest_ts']).dt.total_seconds() * 1000
            
            if 'writer_ts' in combined_df.columns:
                combined_df['writer_ts'] = pd.to_datetime(combined_df['writer_ts'], utc=True)
                inf = (combined_df['inference_ts'] - combined_df['writer_ts']).dt.total_seconds() * 1000
            else:
                inf = e2e

            e2e_mean = e2e.mean()
            inf_mean = inf.mean()
            e2e_list.append(e2e_mean)
            inf_list.append(inf_mean)

            if 'source_id' in combined_df.columns:
                sims.update(combined_df['source_id'].unique().tolist())

            severity_dist = {"NORMAL": 0.0, "WARNING": 0.0, "CRITICAL": 0.0}
            if "severity" in combined_df.columns:
                total_rows = len(combined_df)
                if total_rows > 0:
                    counts = combined_df["severity"].value_counts()
                    for sev in ["NORMAL", "WARNING", "CRITICAL"]:
                        severity_dist[sev] = round(counts.get(sev, 0) / total_rows * 100, 1)

            module_stats[mod.upper()] = {
                "e2e_latency": round(e2e_mean, 1) if pd.notna(e2e_mean) else 0,
                "inf_latency": round(inf_mean, 1) if pd.notna(inf_mean) else 0,
                "rows_5m": len(combined_df),
                "severity_dist": severity_dist
            }

        # Update Cache Exactly as React Expects
        INFERENCE_METRICS_CACHE["active_sims"] = len(sims)
        INFERENCE_METRICS_CACHE["active_modules"] = len(module_stats)
        INFERENCE_METRICS_CACHE["global_e2e_ms"] = round(sum(e2e_list)/len(e2e_list), 1) if e2e_list else 0
        INFERENCE_METRICS_CACHE["global_inf_ms"] = round(sum(inf_list)/len(inf_list), 1) if inf_list else 0
        INFERENCE_METRICS_CACHE["module_stats"] = module_stats
        INFERENCE_METRICS_CACHE["recent_alerts"] = recent_alerts[:10]

    except Exception as e:
        print(f"Inference metrics computation failed: {e}")

async def update_inference_metrics_loop():
    while True:
        await asyncio.to_thread(_sync_update_metrics)
        await asyncio.sleep(2)

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(update_inference_metrics_loop())

# --- Endpoints ---
@app.get("/api/inference/metrics")
def get_inference_metrics():
    return INFERENCE_METRICS_CACHE

@app.get("/api/inference/tail/{module}")
def get_inference_tail(module: str):
    if module not in VEHICLE_MODULES:
        raise HTTPException(status_code=400, detail="Invalid module")
    path = Path(SILVER_ROOT) / module
    if not path.exists():
        return {"data": []}
    try:
        files = dr.list_files(str(path), max_files=5)
        if not files:
            return {"data": []}
        _tail_cols = "row_hash, source_id, module, timestamp, inference_ts, ingest_ts, writer_ts, health_score, severity, severity_code, composite_score, lstm_smoothed, top_features"
        df = dr.query_df(f"SELECT {_tail_cols} FROM read_parquet(?)", files)
        if df.empty:
            return {"data": []}
        if "inference_ts" in df.columns:
            df["inference_ts"] = pd.to_datetime(df["inference_ts"], utc=True)
            df = df.sort_values("inference_ts", ascending=False)
            if "source_id" in df.columns:
                n_sims = max(df["source_id"].nunique(), 1)
                rows_per_sim = max(10, 100 // n_sims)
                df = df.groupby("source_id", group_keys=False).head(rows_per_sim)
                df = df.sort_values("inference_ts", ascending=False)
            df = df.head(100)
            df["inference_ts"] = df["inference_ts"].astype(str)
        df = df.fillna(0)
        for col in df.select_dtypes(include=["datetime64[ns]", "datetime64[ns, UTC]"]).columns:
            df[col] = df[col].astype(str)
        return {"data": df.to_dict(orient="records")}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    # Inference runs on port 8002
    uvicorn.run("api:app", host="127.0.0.1", port=8002, reload=True)