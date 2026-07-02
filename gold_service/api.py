import os
import sys
import asyncio
import pandas as pd
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# --- Paths & Constants ---
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(CURRENT_DIR, ".."))
SILVER_ROOT = os.path.join(PROJECT_ROOT, "data", "delta", "silver")
GOLD_ROOT = os.path.join(PROJECT_ROOT, "data", "delta", "gold", "vehicle_health")

if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)
from common import duck_reader as dr

try:
    from src import config as gold_config
    GOLD_ENABLED_MODULES = gold_config.ENABLED_MODULES
    GOLD_WEIGHTS = gold_config.NORMALIZED_WEIGHTS
    GOLD_PENALTIES = gold_config.TIER_1_PENALTIES
except ImportError:
    GOLD_ENABLED_MODULES = ["engine", "transmission", "battery", "body", "tyre"]
    GOLD_WEIGHTS = {"engine": 0.35, "transmission": 0.25, "battery": 0.20, "body": 0.10, "tyre": 0.10}
    GOLD_PENALTIES = {"engine": 30.0, "transmission": 25.0, "battery": 20.0}

# --- Cache ---
GOLD_METRICS_CACHE = {
    "active_sims": [],
    "total_gold_rows": 0,
    "processing_lags": {mod: 0 for mod in GOLD_ENABLED_MODULES}
}

# --- App Definition ---
app = FastAPI(title="Gold Service Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_GOLD_MAX_FILES = 200

# --- Background Logic ---
_last_gold_mtime = 0.0

def _sync_update_metrics():
    global GOLD_METRICS_CACHE, _last_gold_mtime
    try:
        current_mtime = 0.0
        gold_path = Path(GOLD_ROOT)
        if gold_path.exists():
            try:
                for entry in os.scandir(str(gold_path)):
                    if entry.is_file() and entry.name.endswith(".parquet"):
                        mt = entry.stat().st_mtime
                        if mt > current_mtime:
                            current_mtime = mt
            except Exception:
                pass

        if current_mtime > 0 and current_mtime <= _last_gold_mtime:
            return
        _last_gold_mtime = current_mtime

        silver_counts = {m: 0 for m in GOLD_ENABLED_MODULES}
        for mod in GOLD_ENABLED_MODULES:
            silver_path = Path(SILVER_ROOT) / mod
            if silver_path.exists():
                try:
                    count = sum(1 for e in os.scandir(str(silver_path)) if e.is_file() and e.name.endswith(".parquet"))
                except Exception:
                    count = 0
                silver_counts[mod] = count * 35

        gold_count = 0
        active_sims = set()
        if gold_path.exists():
            gfiles = dr.list_files(str(gold_path))
            if gfiles:
                try:
                    # Count deduplicated records (same window can appear in
                    # multiple files before compaction runs; show the
                    # meaningful count, not physical row count which swings
                    # dramatically on every compaction cycle).
                    count_df = dr.query_df(
                        "SELECT COUNT(*) AS n, COUNT(DISTINCT source_id) AS sims FROM read_parquet(?)",
                        gfiles,
                    )
                    if not count_df.empty:
                        gold_count = int(count_df.iloc[0]["n"])
                        # Pull unique source_ids without loading all rows
                        sid_df = dr.query_df(
                            "SELECT DISTINCT source_id FROM read_parquet(?)",
                            gfiles,
                        )
                        if not sid_df.empty and "source_id" in sid_df.columns:
                            active_sims = set(sid_df["source_id"].dropna().astype(str).tolist())
                except Exception:
                    gold_count = len(gfiles) * 7

        GOLD_METRICS_CACHE["active_sims"] = sorted(list(active_sims))
        GOLD_METRICS_CACHE["total_gold_rows"] = gold_count
        GOLD_METRICS_CACHE["processing_lags"] = {mod: max(0, silver_counts[mod] - gold_count) for mod in GOLD_ENABLED_MODULES}

    except Exception as e:
        print(f"Gold metrics loop failed: {e}")

async def update_gold_metrics_loop():
    while True:
        await asyncio.to_thread(_sync_update_metrics)
        await asyncio.sleep(5)

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(update_gold_metrics_loop())

# --- Endpoints ---
@app.get("/api/gold/metrics")
def get_gold_metrics():
    return GOLD_METRICS_CACHE

@app.get("/api/gold/config")
def get_gold_config():
    return {
        "enabled_modules": GOLD_ENABLED_MODULES,
        "default_weights": GOLD_WEIGHTS,
        "tier_1_penalties": GOLD_PENALTIES
    }

@app.get("/api/gold/history/{sim_id}")
def get_gold_history(sim_id: str):
    try:
        files = dr.list_files(GOLD_ROOT, max_files=_GOLD_MAX_FILES)
        if not files:
            return {"data": []}
        if sim_id.upper() != "ALL":
            df = dr.query_df("SELECT * FROM read_parquet(?) WHERE source_id = ?", files, params=[sim_id])
        else:
            df = dr.query_df("SELECT * FROM read_parquet(?)", files)
        if df.empty or "source_id" not in df.columns:
            return {"data": []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    if 'gold_window_ts' in df.columns:
        df['gold_window_ts'] = pd.to_datetime(df['gold_window_ts'])
        # Gold is append-only — the same (source_id, window) gets a new row
        # every time that window's state is touched. Dedup on the write-order
        # column (not gold_window_ts itself, which ties don't order
        # meaningfully) to keep the most-recently-written version. ALL mode
        # must include source_id in the subset or rows from different
        # vehicles sharing a window timestamp would incorrectly collapse.
        sort_col = 'gold_write_ts' if 'gold_write_ts' in df.columns else 'gold_window_ts'
        dedup_subset = ['gold_window_ts'] if sim_id.upper() != "ALL" else ['source_id', 'gold_window_ts']
        df = df.sort_values(sort_col).drop_duplicates(subset=dedup_subset, keep='last')
        df = df.sort_values('gold_window_ts', ascending=True)

    df = df.fillna(0)
    for col in df.select_dtypes(include=['datetime64[ns]', 'datetime64[ns, UTC]']).columns:
        df[col] = df[col].astype(str)

    return {"data": df.tail(200).to_dict(orient="records")}

if __name__ == "__main__":
    import uvicorn
    # Gold runs on port 8003
    uvicorn.run("api:app", host="127.0.0.1", port=8003, reload=True)