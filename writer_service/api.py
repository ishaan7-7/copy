import os
import sys
import json
import time
import asyncio
import pandas as pd
from pathlib import Path
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

# --- Paths & Constants ---
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(CURRENT_DIR, ".."))
DELTA_ROOT = os.path.join(PROJECT_ROOT, "data", "delta", "bronze")
STATE_DIR = os.path.join(CURRENT_DIR, "state")

if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)
from common import duck_reader as dr
from deltalake import DeltaTable

VEHICLE_MODULES = ["battery", "body", "engine", "transmission", "tyre"]
SERVICE_START_TIME = time.time()

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
WRITER_METRICS_CACHE = {
    module: {
        "module": module.upper(),
        "status": "OFFLINE",
        "kafka_total": 0,
        "delta_total": 0,
        "true_lag": 0,
        "throughput": "0.0",
        "processed": "0.0",
        "latency_ms": 0
    } for module in VEHICLE_MODULES
}

# --- App Definition ---
app = FastAPI(title="Writer Service Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

async def update_writer_metrics_loop():
    while True:
        try:
            for module in VEHICLE_MODULES:
                file_path = os.path.join(STATE_DIR, f"writer_metrics_{module}.json")
                spark_data = safe_read_json(file_path) or {}
                stream_data = spark_data.get("streams", {}).get(module, {})

                status = spark_data.get("status", "OFFLINE")
                last_updated = spark_data.get("last_updated", 0)
                if status == "RUNNING":
                    if last_updated < SERVICE_START_TIME:
                        status = "STARTING"
                    elif time.time() - last_updated > 10:
                        status = "STALLED"

                total_processed = stream_data.get("total_rows_processed", 0)
                backlog = stream_data.get("backlog", 0)
                input_rate = stream_data.get("input_rate", 0.0)
                process_rate = stream_data.get("process_rate", 0.0)
                if backlog == 0 and input_rate > 0 and process_rate > 0:
                    backlog = max(0, int((input_rate - process_rate) * 5))

                WRITER_METRICS_CACHE[module] = {
                    "module": module.upper(),
                    "status": status,
                    "kafka_total": total_processed + backlog,
                    "delta_total": total_processed,
                    "true_lag": backlog,
                    "throughput": str(round(input_rate, 1)),
                    "processed": str(round(process_rate, 1)),
                    "latency_ms": stream_data.get("duration_ms", 0)
                }
        except Exception as e:
            print(f"Writer metric update failed: {e}")
        await asyncio.sleep(2)

# Spark's structured streaming writes a new small file per (vehicle,
# trigger) — with a 5s trigger and 7 vehicle partitions this is the fastest
# file-count growth of any layer (~8,400 files over a 20-min stream, no
# cleanup). delta-rs's compact()/vacuum() are explicitly built to interoperate
# with Spark-written Delta tables via the standard transaction log (optimistic
# concurrency handles any overlap with Spark's concurrent commits — verified
# compact() correctly compacts per-partition, not across partitions, and
# vacuum(retention_hours=0) only removes files compact() just superseded, not
# anything Spark is concurrently writing). 90s interval (vs Silver's 60s)
# because Bronze has more partitions to walk each pass.
_BRONZE_COMPACT_INTERVAL_SEC = 90

def _compact_bronze_module(module):
    path = os.path.join(DELTA_ROOT, module)
    if not os.path.exists(path):
        return
    try:
        dt = DeltaTable(path)
        dt.optimize.compact()
        dt.vacuum(retention_hours=0, dry_run=False, enforce_retention_duration=False)
    except Exception as e:
        print(f"⚠️ Bronze compaction failed for {module}: {e}")

async def compact_bronze_loop():
    # Sleeping the full interval before the first pass let Bronze build up
    # uncompacted across all 5 modules x 7 partitions before ever being
    # touched — confirmed live: this produced an initial backlog of ~380
    # files, and compacting that much in one pass was expensive enough to
    # contribute to a system-wide stall. A short initial delay (let Spark's
    # first micro-batch actually land) keeps every pass small instead.
    await asyncio.sleep(20)
    for module in VEHICLE_MODULES:
        await asyncio.to_thread(_compact_bronze_module, module)
    while True:
        await asyncio.sleep(_BRONZE_COMPACT_INTERVAL_SEC)
        for module in VEHICLE_MODULES:
            await asyncio.to_thread(_compact_bronze_module, module)

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(update_writer_metrics_loop())
    asyncio.create_task(compact_bronze_loop())

# --- Endpoints ---
@app.get("/api/writer/metrics")
def get_writer_metrics():
    return WRITER_METRICS_CACHE

@app.get("/api/writer/inspector/{module}")
def get_writer_inspector(module: str, limit: int = Query(default=100, ge=1, le=500)):
    if module not in VEHICLE_MODULES:
        raise HTTPException(status_code=400, detail="Invalid module")
    path = Path(DELTA_ROOT) / module
    if not path.exists():
        return {"data": []}
    try:
        files = dr.list_partitioned_files(str(path), max_files_per_partition=2)
        if not files:
            return {"data": []}
        combined = dr.query_df("SELECT * FROM read_parquet(?)", files, hive_partitioning=True)
        if combined.empty:
            return {"data": []}

        if "ingest_ts" in combined.columns:
            combined["ingest_ts"] = pd.to_datetime(combined["ingest_ts"], utc=True)
            combined = combined.sort_values("ingest_ts", ascending=False)
            if "source_id" in combined.columns:
                n_sims = max(combined["source_id"].nunique(), 1)
                rows_per_sim = max(10, 100 // n_sims)
                combined = combined.groupby("source_id", group_keys=False).head(rows_per_sim)
                combined = combined.sort_values("ingest_ts", ascending=False)
            combined = combined.head(limit)
            combined["ingest_ts"] = combined["ingest_ts"].astype(str)
        combined = combined.fillna(0)
        for col in combined.select_dtypes(include=["datetime64[ns]", "datetime64[ns, UTC]"]).columns:
            combined[col] = combined[col].astype(str)
        return {"data": combined.to_dict(orient="records")}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    # Writer runs on port 8001
    uvicorn.run("api:app", host="127.0.0.1", port=8001, reload=True)