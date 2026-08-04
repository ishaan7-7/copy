import os
import sys
import json
import time
import asyncio
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from confluent_kafka import Consumer, TopicPartition  # Kept ONLY for writer metrics fallback
from aiokafka import AIOKafkaConsumer
from utils import safe_read_json, safe_read_pickle
from concurrent.futures import ProcessPoolExecutor
import plotly.express as px
from pydantic import BaseModel
import uuid
import datetime
from collections import defaultdict, deque
import aiohttp
import re

# --- OBSERVER & NETWORK STATE ---
PORTS_TO_CHECK = {
    "Zookeeper": 2181,
    "Kafka": 9092,
    "Ingest": 8000,
    "Replay/Dashboard API": 8005, 
    "React UI": 5173
}

VALIDATION_REGEX = re.compile(r'ingest_rows_validation_detail(?:_total)?\{.*vehicle_id="([^"]+)".*status="([^"]+)".*\}\s+(\d+\.?\d*)')
DLQ_GAUGE_REGEX = re.compile(r'dlq_size_files\s+(\d+\.?\d*)')

OBSERVER_HISTORY_LEN = 100
OBSERVER_MAX_VEHICLES = 50
OBSERVER_STALE_SEC = 300

OBSERVER_CACHE = {
    "system_health": {k: False for k in PORTS_TO_CHECK},
    "global_stats": {
        "total_rows": 0,
        "active_vehicles": 0,
        "avg_latency": 0.0,
        "dlq_backlog": 0
    },
    "vehicles": {}
}

# --- OBSERVER STATE ---
# 1. DEFINE APP FIRST
app = FastAPI(
    title="Master Dashboard API",
    description="Read-only data aggregator and execution layer"
)

# 2. THEN ADD MIDDLEWARE
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", "http://127.0.0.1:5173"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

MAX_PARQUET_FILES = 10

def _recent_parquets(directory: str, limit: int = MAX_PARQUET_FILES) -> list:
    if not os.path.exists(directory):
        return []
    all_files = [
        os.path.join(r, f)
        for r, _d, ff in os.walk(directory)
        for f in ff if f.endswith(".parquet")
    ]
    if len(all_files) <= limit:
        return all_files
    all_files.sort(key=os.path.getmtime, reverse=True)
    return all_files[:limit]
VEHICLE_MODULES = ["battery", "body", "engine", "transmission", "tyre"]
DELTA_ROOT = os.path.join(PROJECT_ROOT, "data", "delta", "bronze")
SILVER_ROOT = os.path.join(PROJECT_ROOT, "data", "delta", "silver")
KAFKA_BROKER = "localhost:9092"
GOLD_ROOT = os.path.join(PROJECT_ROOT, "data", "delta", "gold", "vehicle_health")
sys.path.append(os.path.join(PROJECT_ROOT, "gold_service"))
ALERTS_ROOT = os.path.join(PROJECT_ROOT, "data", "delta", "gold", "alerts")
ALERTS_CHECKPOINT = os.path.join(PROJECT_ROOT, "alerts_service", "state", "checkpoints.json")
sys.path.append(os.path.join(PROJECT_ROOT, "alerts_service"))
process_pool = ProcessPoolExecutor(max_workers=1)
try:
    from src import config as gold_config
    GOLD_ENABLED_MODULES = gold_config.ENABLED_MODULES
    GOLD_WEIGHTS = gold_config.NORMALIZED_WEIGHTS
    GOLD_PENALTIES = gold_config.TIER_1_PENALTIES
except ImportError:
    # Fallback if config is inaccessible
    GOLD_ENABLED_MODULES = ["engine", "transmission", "battery", "body", "tyre"]
    GOLD_WEIGHTS = {"engine": 0.35, "transmission": 0.25, "battery": 0.20, "body": 0.10, "tyre": 0.10}
    GOLD_PENALTIES = {"engine": 30.0, "transmission": 25.0, "battery": 20.0}

# --- CACHES FOR HIGH-FREQUENCY POLLING ---
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

INFERENCE_METRICS_CACHE = {
    "active_sims": 0,
    "active_modules": 0,
    "global_e2e_ms": 0,
    "global_inf_ms": 0,
    "module_stats": {},
    "recent_alerts": []
}

GOLD_METRICS_CACHE = {
    "active_sims": [],
    "total_gold_rows": 0,
    "processing_lags": {mod: 0 for mod in GOLD_ENABLED_MODULES}
}

ALERTS_METRICS_CACHE = {
    "active_alerts_count": 0,
    "critical_vehicles": 0,
    "processing_lag": 0,
    "open_alerts": [],
    "closed_alerts": []
}



class TelemetryBackend:
    def __init__(self):
        self.consumer = None
        self._connect()
        
    def _connect(self):
        try:
            conf = {
                'bootstrap.servers': KAFKA_BROKER, 
                'group.id': 'master_dashboard_monitor', 
                'auto.offset.reset': 'earliest',
                'enable.auto.commit': False
            }
            self.consumer = Consumer(conf)
        except Exception:
            pass

    def get_kafka_counts(self):
        counts = {m: 0 for m in VEHICLE_MODULES}
        if not self.consumer:
            self._connect()
            return counts
            
        for m in VEHICLE_MODULES:
            topic = f"telemetry.{m}"
            total = 0
            try:
                meta = self.consumer.list_topics(topic, timeout=0.5)
                if topic in meta.topics:
                    parts = [TopicPartition(topic, p) for p in meta.topics[topic].partitions]
                    for p in parts:
                        _, high = self.consumer.get_watermark_offsets(p, timeout=0.5, cached=False)
                        if high > 0:
                            total += high
            except: 
                pass
            counts[m] = total
        return counts

def get_delta_counts():
    delta_counts = {m: 0 for m in VEHICLE_MODULES}
    for m in VEHICLE_MODULES:
        log_path = os.path.join(DELTA_ROOT, m, "_delta_log")
        total = 0
        if os.path.exists(log_path):
            json_files = [os.path.join(log_path, f) for f in os.listdir(log_path) if f.endswith(".json")]
            for jf in json_files:
                try:
                    with open(jf, "r") as f:
                        for line in f:
                            if "numRecords" in line:
                                action = json.loads(line)
                                if "add" in action:
                                    stats = json.loads(action["add"].get("stats", "{}"))
                                    total += int(stats.get("numRecords", 0))
                except:
                    pass
        delta_counts[m] = total
    return delta_counts

async def update_writer_metrics_loop():
    kafka_monitor = TelemetryBackend()
    while True:
        try:
            # Offload synchronous C-extension and File I/O to background threads
            k_counts = await asyncio.to_thread(kafka_monitor.get_kafka_counts)
            d_counts = await asyncio.to_thread(get_delta_counts)

            for module in VEHICLE_MODULES:
                k_total = k_counts.get(module, 0)
                d_total = d_counts.get(module, 0)
                
                file_path = os.path.join(PROJECT_ROOT, "writer_service", "state", f"writer_metrics_{module}.json")
                spark_data = safe_read_json(file_path) or {}
                stream_data = spark_data.get("streams", {}).get(module, {})
                
                status = spark_data.get("status", "OFFLINE")
                if status == "RUNNING" and (time.time() - spark_data.get("last_updated", 0) > 10):
                    status = "STALLED"

                WRITER_METRICS_CACHE[module] = {
                    "module": module.upper(),
                    "status": status,
                    "kafka_total": k_total,
                    "delta_total": d_total,
                    "true_lag": max(0, k_total - d_total),
                    "throughput": str(round(stream_data.get("input_rate", 0.0), 1)),
                    "processed": str(round(stream_data.get("process_rate", 0.0), 1)),
                    "latency_ms": stream_data.get("duration_ms", 0)
                }
        except Exception as e:
            print(f"Writer metric update failed: {e}")
        await asyncio.sleep(5)

async def update_inference_metrics_loop():
    """Profiles the Silver layer and alerts for the ML Engine Dashboard"""
    while True:
        try:
            # 1. Load System Alerts (Last 5 mins)
            all_alerts = []
            for mod in VEHICLE_MODULES:
                alerts_file = os.path.join(PROJECT_ROOT, "inference_service", "state", f"system_alerts_{mod}.json")
                alerts = safe_read_json(alerts_file)
                if alerts:
                    all_alerts.extend(alerts)

            cutoff_dt = pd.Timestamp.utcnow() - pd.Timedelta(minutes=5)
            recent_alerts = []
            for a in all_alerts:
                try:
                    alert_time = pd.to_datetime(a['timestamp'], utc=True)
                    if alert_time >= cutoff_dt:
                        recent_alerts.append(a)
                except: pass
            recent_alerts.sort(key=lambda x: x['timestamp'], reverse=True)

            # 2. Compute Silver Metrics
            sims = set()
            module_stats = {}
            e2e_list = []
            inf_list = []

            for mod in VEHICLE_MODULES:
                path = os.path.join(SILVER_ROOT, mod)
                if not os.path.exists(path): continue

                files = []
                for r, d, f in os.walk(path):
                    for file in f:
                        if file.endswith(".parquet"):
                            files.append(os.path.join(r, file))
                files.sort(key=os.path.getmtime, reverse=True)

                dfs = []
                for f in files[:5]: # Check recent parquets for 5-minute window
                    try:
                        df = pd.read_parquet(f)
                        if not df.empty and 'inference_ts' in df.columns:
                            df['inference_ts'] = pd.to_datetime(df['inference_ts'], utc=True)
                            df = df[df['inference_ts'] >= cutoff_dt]
                            if not df.empty:
                                dfs.append(df)
                    except: pass

                if dfs:
                    combined_df = pd.concat(dfs, ignore_index=True)
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

                    module_stats[mod.upper()] = {
                        "e2e_latency": round(e2e_mean, 1) if pd.notna(e2e_mean) else 0,
                        "inf_latency": round(inf_mean, 1) if pd.notna(inf_mean) else 0,
                        "rows_5m": len(combined_df)
                    }

            # Update Cache
            INFERENCE_METRICS_CACHE["active_sims"] = len(sims)
            INFERENCE_METRICS_CACHE["active_modules"] = len(module_stats)
            INFERENCE_METRICS_CACHE["global_e2e_ms"] = round(sum(e2e_list)/len(e2e_list), 1) if e2e_list else 0
            INFERENCE_METRICS_CACHE["global_inf_ms"] = round(sum(inf_list)/len(inf_list), 1) if inf_list else 0
            INFERENCE_METRICS_CACHE["module_stats"] = module_stats
            INFERENCE_METRICS_CACHE["recent_alerts"] = recent_alerts[:10]

        except Exception as e:
            print(f"Inference metrics loop failed: {e}")
            
        await asyncio.sleep(5)

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(update_writer_metrics_loop())
    asyncio.create_task(update_inference_metrics_loop())
    asyncio.create_task(update_gold_metrics_loop())
    asyncio.create_task(update_alerts_metrics_loop())
    asyncio.create_task(observer_health_loop())      
    asyncio.create_task(observer_kafka_loop())

@app.get("/health")
def health_check():
    return {"status": "Master Dashboard Backend is Online", "port": 8005}

# --- WRITER OPS ENDPOINTS ---
@app.get("/api/writer/metrics")
def get_writer_metrics():
    return WRITER_METRICS_CACHE

@app.get("/api/writer/inspector/{module}")
def get_writer_inspector(module: str):
    if module not in VEHICLE_MODULES:
        raise HTTPException(status_code=400, detail="Invalid module")
        
    path = os.path.join(DELTA_ROOT, module)
    if not os.path.exists(path): return {"data": []}
        
    files = []
    for root, _, filenames in os.walk(path):
        for f in filenames:
            if f.endswith(".parquet"):
                files.append(os.path.join(root, f))
                
    if not files: return {"data": []}
    files.sort(key=os.path.getmtime, reverse=True)
    
    data_frames = []
    try:
        for f in files[:10]: 
            df = pd.read_parquet(f)
            if not df.empty:
                data_frames.append(df)
                
        if not data_frames:
            return {"data": []}
            
        combined_df = pd.concat(data_frames, ignore_index=True)
        if "ingest_ts" in combined_df.columns:
            combined_df["ingest_ts"] = pd.to_datetime(combined_df["ingest_ts"]).astype(str)
            combined_df = combined_df.sort_values("ingest_ts", ascending=False)
            
        combined_df = combined_df.fillna(0)
        for col in combined_df.select_dtypes(include=['datetime64[ns]']).columns:
            combined_df[col] = combined_df[col].astype(str)
            
        return {"data": combined_df.head(100).to_dict(orient="records")}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- INFERENCE OPS ENDPOINTS ---
@app.get("/api/inference/metrics")
def get_inference_metrics():
    """Powers the KPI metrics, alerts, and latency breakdown."""
    return INFERENCE_METRICS_CACHE

@app.get("/api/inference/tail/{module}")
def get_inference_tail(module: str):
    """Powers the Live Silver Data (Tail) view"""
    if module not in VEHICLE_MODULES:
        raise HTTPException(status_code=400, detail="Invalid module")
        
    path = os.path.join(SILVER_ROOT, module)
    if not os.path.exists(path): return {"data": []}
        
    files = []
    for root, _, filenames in os.walk(path):
        for f in filenames:
            if f.endswith(".parquet"):
                files.append(os.path.join(root, f))
                
    if not files: return {"data": []}
    files.sort(key=os.path.getmtime, reverse=True)
    
    data_frames = []
    try:
        for f in files[:10]: 
            df = pd.read_parquet(f)
            if not df.empty:
                data_frames.append(df)
                
        if not data_frames:
            return {"data": []}
            
        combined_df = pd.concat(data_frames, ignore_index=True)
        if "inference_ts" in combined_df.columns:
            combined_df["inference_ts"] = pd.to_datetime(combined_df["inference_ts"]).astype(str)
            combined_df = combined_df.sort_values("inference_ts", ascending=False)
            
        combined_df = combined_df.fillna(0)
        # Handle both timezone-naive and timezone-aware datetimes generated by PyTorch/Spark
        for col in combined_df.select_dtypes(include=['datetime64[ns]', 'datetime64[ns, UTC]']).columns:
            combined_df[col] = combined_df[col].astype(str)
            
        return {"data": combined_df.head(100).to_dict(orient="records")}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
async def update_gold_metrics_loop():
    while True:
        try:
            silver_counts = {m: 0 for m in GOLD_ENABLED_MODULES}
            for mod in GOLD_ENABLED_MODULES:
                silver_path = os.path.join(SILVER_ROOT, mod)
                if os.path.exists(silver_path):
                    s_files = [os.path.join(r, f) for r, d, f in os.walk(silver_path) for f in f if f.endswith(".parquet")]
                    silver_counts[mod] = len(s_files) * 50

            gold_count = 0
            active_sims = set()
            if os.path.exists(GOLD_ROOT):
                g_files = [os.path.join(r, f) for r, d, f in os.walk(GOLD_ROOT) for f in f if f.endswith(".parquet")]
                if g_files:
                    latest_file = max(g_files, key=os.path.getmtime)
                    try:
                        df = pd.read_parquet(latest_file)
                        gold_count = len(g_files) * max(len(df), 1)
                        if 'source_id' in df.columns:
                            active_sims.update(df['source_id'].unique().tolist())
                        del df
                    except:
                        gold_count = len(g_files) * 50

            GOLD_METRICS_CACHE["active_sims"] = sorted(list(active_sims))
            GOLD_METRICS_CACHE["total_gold_rows"] = gold_count
            GOLD_METRICS_CACHE["processing_lags"] = {mod: max(0, silver_counts[mod] - gold_count) for mod in GOLD_ENABLED_MODULES}

        except Exception as e:
            print(f"Gold metrics loop failed: {e}")
        await asyncio.sleep(5)

# --- GOLD ENDPOINTS ---

@app.get("/api/gold/metrics")
def get_gold_metrics():
    return GOLD_METRICS_CACHE

@app.get("/api/gold/config")
def get_gold_config():
    """Provides the aggregator config for the React Experimentation UI"""
    return {
        "enabled_modules": GOLD_ENABLED_MODULES,
        "default_weights": GOLD_WEIGHTS,
        "tier_1_penalties": GOLD_PENALTIES
    }

@app.get("/api/gold/history/{sim_id}")
def get_gold_history(sim_id: str):
    """Fetches history of a specific sim, or the entire fleet if sim_id='ALL'"""
    if not os.path.exists(GOLD_ROOT): return {"data": []}
        
    files = [os.path.join(r, f) for r, d, f in os.walk(GOLD_ROOT) for f in f if f.endswith(".parquet")]
    if not files: return {"data": []}
        
    dfs = []
    for f in files:
        try:
            df = pd.read_parquet(f)
            if 'source_id' in df.columns:
                if sim_id.upper() == "ALL":
                    dfs.append(df)
                else:
                    sim_df = df[df['source_id'] == sim_id]
                    if not sim_df.empty: dfs.append(sim_df)
        except Exception: pass
        
    if not dfs: return {"data": []}
    combined_df = pd.concat(dfs, ignore_index=True)
    
    if 'gold_window_ts' in combined_df.columns:
        combined_df['gold_window_ts'] = pd.to_datetime(combined_df['gold_window_ts'])
        combined_df = combined_df.sort_values('gold_window_ts', ascending=True)
        # Only drop duplicates if we are looking at a single sim
        if sim_id.upper() != "ALL":
            combined_df = combined_df.drop_duplicates(subset=['gold_window_ts'], keep='last')
            
    combined_df = combined_df.fillna(0)
    for col in combined_df.select_dtypes(include=['datetime64[ns]', 'datetime64[ns, UTC]']).columns:
        combined_df[col] = combined_df[col].astype(str)
        
    # Limit to last 1000 to prevent browser crash when viewing entire fleet
    return {"data": combined_df.tail(1000).to_dict(orient="records")}

# --- ALERTS & DTC ENDPOINTS ---

async def update_alerts_metrics_loop():
    while True:
        try:
            lag_rows = 0
            # 1. Calculate Lag using Checkpoints vs Silver
            try:
                if os.path.exists(ALERTS_CHECKPOINT) and os.path.exists(SILVER_ROOT):
                    ckpt = safe_read_json(ALERTS_CHECKPOINT) or {}
                    primary_mod = GOLD_ENABLED_MODULES[0] if GOLD_ENABLED_MODULES else "engine"
                    last_ts = ckpt.get(primary_mod, "1970-01-01T00:00:00")
                    
                    silver_primary = os.path.join(SILVER_ROOT, primary_mod)
                    if os.path.exists(silver_primary):
                        s_files = [os.path.join(r, f) for r, d, f in os.walk(silver_primary) for f in f if f.endswith(".parquet")]
                        for f in s_files:
                            try:
                                df = pd.read_parquet(f)
                                if 'inference_ts' in df.columns:
                                    df['inference_ts'] = pd.to_datetime(df['inference_ts'], utc=True)
                                    lag_rows += len(df[df['inference_ts'] > pd.to_datetime(last_ts, utc=True)])
                            except: pass
            except: pass

            # 2. Read Gold Alerts Table (recent files only)
            df_alerts = pd.DataFrame()
            files = _recent_parquets(ALERTS_ROOT)
            if files:
                dfs = []
                for f in files:
                    try: dfs.append(pd.read_parquet(f))
                    except: pass
                if dfs:
                    df_alerts = pd.concat(dfs, ignore_index=True)
            
            active_alerts = 0
            crit_vehicles = 0
            open_alerts = []
            closed_alerts = []

            if not df_alerts.empty:
                df_alerts = df_alerts.fillna(0)
                for col in df_alerts.select_dtypes(include=['datetime64[ns]', 'datetime64[ns, UTC]']).columns:
                    df_alerts[col] = df_alerts[col].astype(str)

                open_df = df_alerts[df_alerts['status'] == "OPEN"].sort_values('peak_anomaly_ts', ascending=False)
                closed_df = df_alerts[df_alerts['status'] == "CLOSED"].sort_values('alert_end_ts', ascending=False)

                active_alerts = len(open_df)
                crit_vehicles = open_df['source_id'].nunique() if not open_df.empty else 0
                open_alerts = open_df.head(50).to_dict(orient="records")
                closed_alerts = closed_df.head(50).to_dict(orient="records")

            # 3. Update Cache
            ALERTS_METRICS_CACHE["active_alerts_count"] = active_alerts
            ALERTS_METRICS_CACHE["critical_vehicles"] = crit_vehicles
            ALERTS_METRICS_CACHE["processing_lag"] = lag_rows
            ALERTS_METRICS_CACHE["open_alerts"] = open_alerts
            ALERTS_METRICS_CACHE["closed_alerts"] = closed_alerts

        except Exception as e:
            print(f"Alerts metrics loop failed: {e}")
        await asyncio.sleep(5)

@app.get("/api/alerts/metrics")
def get_alerts_metrics():
    return ALERTS_METRICS_CACHE

def _execute_dtc_pipeline(module: str, source_id: str, peak_ts: str):
    """Executes heavy PyTorch inference in an isolated process"""
    try:
        import pandas as pd
        from DTC_service.analyzer import DTCAdapter
        
        adapter = DTCAdapter(module_name=module)
        
        # 1. Convert the raw web string into a native Pandas Datetime object
        # This allows the analyzer to do time-window math (e.g. peak_ts +/- 2 minutes)
        peak_datetime = pd.to_datetime(peak_ts)
        
        # 2. Architecturally, this is fetching from the Bronze layer
        bronze_df = adapter.fetch_traceback(source_id, peak_datetime)
        
        if bronze_df.empty:
            return {"error": f"Traceback data not found in Bronze table for {source_id} at {peak_ts}."}
            
        df_crit, df_noncrit, triggers, diagnostics = adapter.run_diagnosis(bronze_df)
        
        def render_plot_to_json(df_buildup, title, color_theme):
            if df_buildup.empty: return None
            cols_to_plot = [c for c in df_buildup.columns if c != 'timestamp']
            if len(cols_to_plot) == 0: return None
            
            plot_df = df_buildup.melt(id_vars=['timestamp'], value_vars=cols_to_plot, var_name='DTC_Code', value_name='Risk_Level')
            fig = px.line(plot_df, x='timestamp', y='Risk_Level', color='DTC_Code', title=title, color_discrete_sequence=color_theme)
            fig.add_hline(y=1.0, line_dash="dash", line_color="red", annotation_text="100% Failure Trigger")
            fig.update_yaxes(range=[0, 1.1])
            # Apply strictly industrial white theme formatting
            fig.update_layout(template="plotly_white", margin=dict(l=20, r=20, t=40, b=20), paper_bgcolor='rgba(0,0,0,0)', plot_bgcolor='rgba(0,0,0,0)')
            return json.loads(fig.to_json())
        
        return {
            "success": True,
            "triggers": triggers,
            "diagnostics": diagnostics,
            "critical_plot": render_plot_to_json(df_crit, "Critical Fault Maturation", px.colors.qualitative.Set1),
            "non_critical_plot": render_plot_to_json(df_noncrit, "Non-Critical Fault Maturation", px.colors.qualitative.Pastel1)
        }
    except Exception as e:
        return {"error": f"DTC Analysis computation failed: {str(e)}"}

@app.get("/api/dtc/analyze")
def analyze_dtc(module: str, source_id: str, peak_ts: str):
    try:
        # Offload to process pool to prevent blocking the FastAPI event loop
        future = process_pool.submit(_execute_dtc_pipeline, module, source_id, peak_ts)
        result = future.result(timeout=60)
        return result
    except Exception as e:
        return {"error": f"DTC Analysis computation failed: {str(e)}"}
    
# --- TELEMETRY OBSERVER & REPLAY DASHBOARD ENDPOINTS ---

async def observer_health_loop():
    """Scans local ports and scrapes the Ingest /metrics endpoint for Data Quality stats"""
    while True:
        try:
            # 1. Port Scanner
            for name, port in PORTS_TO_CHECK.items():
                try:
                    _, writer = await asyncio.wait_for(asyncio.open_connection("127.0.0.1", port), timeout=0.2)
                    writer.close()
                    await writer.wait_closed()
                    OBSERVER_CACHE["system_health"][name] = True
                except:
                    OBSERVER_CACHE["system_health"][name] = False
            
            # 2. HTTP Metrics Poller (DLQ and Rejected Rows)
            if OBSERVER_CACHE["system_health"].get("Ingest", False):
                async with aiohttp.ClientSession() as session:
                    async with session.get("http://127.0.0.1:8000/metrics", timeout=1) as resp:
                        if resp.status == 200:
                            text = await resp.text()
                            temp_dlq = 0
                            for line in text.splitlines():
                                if line.startswith("#"): continue
                                
                                v_match = VALIDATION_REGEX.search(line)
                                if v_match:
                                    v_id, status, val = v_match.groups()
                                    if status == "rejected" and v_id in OBSERVER_CACHE["vehicles"]:
                                        OBSERVER_CACHE["vehicles"][v_id]["rejected"] = int(float(val))
                                    continue

                                d_match = DLQ_GAUGE_REGEX.search(line)
                                if d_match:
                                    temp_dlq = int(float(d_match.group(1)))
                                    
                            OBSERVER_CACHE["global_stats"]["dlq_backlog"] = temp_dlq
        except Exception:
            pass
        await asyncio.sleep(5)

async def observer_kafka_loop():
    """Listens to raw Kafka streams using purely asynchronous aiokafka to prevent event-loop blocking"""
    topics = [f"telemetry.{m}" for m in VEHICLE_MODULES]
    unique_group_id = f"master_dashboard_observer_{uuid.uuid4().hex[:8]}"
    
    consumer = AIOKafkaConsumer(
        *topics,
        bootstrap_servers=KAFKA_BROKER,
        group_id=unique_group_id, 
        # CHANGED TO EARLIEST: This will force it to read the topic history
        auto_offset_reset="earliest", 
        session_timeout_ms=45000,
        heartbeat_interval_ms=15000
    )

    try:
        await consumer.start()
        print(f"[OBSERVER] Connected to topics: {topics}. Waiting for data...")
        
        async for msg in consumer:
            try:
                val = msg.value
                if not val: continue
                
                # DEBUG: Print exactly what we received before it crashes
                print(f"[OBSERVER DEBUG] Received raw bytes on {msg.topic}: {val[:100]}...")
                
                payload = json.loads(val.decode('utf-8'))
                meta = payload.get("metadata", payload)
                data_body = payload.get("data", payload)
                
                v_id = meta.get("vehicle_id") or payload.get("source_id", "unknown_sim")
                module = meta.get("module", payload.get("module", "unknown")).lower()
                ingest_ts_str = meta.get("ingest_ts", payload.get("ingest_ts"))

                if v_id not in OBSERVER_CACHE["vehicles"]:
                    OBSERVER_CACHE["vehicles"][v_id] = {
                        "accepted": 0, "rejected": 0, "latency_sum": 0.0, "latency_count": 0,
                        "last_seen": time.time(), "latest_payload": {}, "module_payloads": {},
                        "history": defaultdict(lambda: {
                            "timestamps": deque(maxlen=OBSERVER_HISTORY_LEN),
                            "metrics": defaultdict(lambda: deque(maxlen=OBSERVER_HISTORY_LEN))
                        })
                    }

                now_t = time.time()
                vehicles_dict = OBSERVER_CACHE["vehicles"]

                if len(vehicles_dict) > OBSERVER_MAX_VEHICLES:
                    stale_ids = [k for k, v in vehicles_dict.items() if now_t - v.get("last_seen", 0) > OBSERVER_STALE_SEC]
                    for sid in stale_ids:
                        del vehicles_dict[sid]

                entry = vehicles_dict[v_id]
                entry["accepted"] += 1
                entry["last_seen"] = now_t

                latency_ms = 0.0
                if ingest_ts_str:
                    try:
                        ts = datetime.datetime.fromisoformat(ingest_ts_str)
                        if ts.tzinfo is None:
                            ts = ts.replace(tzinfo=datetime.timezone.utc)
                        latency_ms = (datetime.datetime.now(datetime.timezone.utc) - ts).total_seconds() * 1000
                        if latency_ms < 0: latency_ms = 0
                    except: pass

                entry["latency_sum"] += latency_ms
                entry["latency_count"] += 1
                entry["latest_payload"] = payload
                entry["module_payloads"][module] = payload

                # Buffer History for React Charts
                now_str = datetime.datetime.now(datetime.timezone.utc).strftime("%H:%M:%S")
                mod_hist = entry["history"][module]
                mod_hist["timestamps"].append(now_str)

                for k, v in data_body.items():
                    if isinstance(v, (int, float)) and not isinstance(v, bool):
                        mod_hist["metrics"][k].append(v)

            except Exception as e:
                # NO MORE SILENT FAILURES
                print(f"[OBSERVER ERROR] Failed processing message: {e}")
                
    except Exception as e:
        print(f"[OBSERVER FATAL] Consumer crashed: {e}")
    finally:
        await consumer.stop()

@app.get("/api/observer/snapshot")
def get_observer_snapshot():
    """Serves the live buffered data to the React Observer UI"""
    total_rows = 0
    global_lat_sum = 0
    global_lat_count = 0
    vehicle_list = []
    
    current_time = time.time()

    # Iterate safely to package the nested deques into pure JSON lists
    for v_id, data in OBSERVER_CACHE["vehicles"].items():
        acc = data["accepted"]
        rej = data["rejected"]
        total = acc + rej
        val_rate = (acc / total * 100.0) if total > 0 else 100.0
        
        v_lat = (data["latency_sum"] / data["latency_count"]) if data["latency_count"] > 0 else 0
        global_lat_sum += data["latency_sum"]
        global_lat_count += data["latency_count"]
        
        ago = round(current_time - data["last_seen"], 1)
        
        clean_history = {}
        for mod, h_data in data["history"].items():
            clean_history[mod] = {
                "timestamps": list(h_data["timestamps"]),
                "metrics": {k: list(v) for k, v in h_data["metrics"].items()}
            }
            
        trimmed_history = {}
        for mod, h_data in clean_history.items():
            ts_list = list(h_data["timestamps"])[-30:]
            trimmed_metrics = {}
            for k, v_list in h_data["metrics"].items():
                trimmed_metrics[k] = list(v_list)[-30:]
            trimmed_history[mod] = {"timestamps": ts_list, "metrics": trimmed_metrics}

        vehicle_list.append({
            "vehicle_id": v_id,
            "rows_processed": acc,
            "rejected_rows": rej,
            "validation_rate": round(val_rate, 1),
            "avg_latency": round(v_lat, 1),
            "last_seen_sec": ago,
            "latest_payload": data.get("latest_payload") or {},
            "module_payloads": data.get("module_payloads") or {},
            "history": trimmed_history
        })
        total_rows += acc

    global_avg_lat = (global_lat_sum / global_lat_count) if global_lat_count > 0 else 0.0

    OBSERVER_CACHE["global_stats"]["total_rows"] = total_rows
    OBSERVER_CACHE["global_stats"]["active_vehicles"] = len(vehicle_list)
    OBSERVER_CACHE["global_stats"]["avg_latency"] = round(global_avg_lat, 1)

    return {
        "system_health": OBSERVER_CACHE["system_health"],
        "global_stats": OBSERVER_CACHE["global_stats"],
        "vehicles": vehicle_list
    }

@app.get("/api/observer/vehicle/{vehicle_id}/payload")
def get_observer_vehicle_payload(vehicle_id: str):
    data = OBSERVER_CACHE["vehicles"].get(vehicle_id)
    if not data:
        return {"latest_payload": {}, "module_payloads": {}}
    return {
        "latest_payload": data.get("latest_payload", {}),
        "module_payloads": data.get("module_payloads", {}),
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8005, reload=True)


# ============================================================
# AUTOMOTIVE DEEP DIVE + PRESENTATION MODE — ADDITIVE SECTION
# No existing code above was modified. Pure additions below.
# ============================================================

_PRESENTATION_MODE_ACTIVE: bool = False
_DEMO_SEED_CACHE: dict = {}
_DEMO_VEHICLES: list = ["sim001", "sim002", "sim003", "sim004", "sim005", "sim006", "sim007"]

_KEY_SENSOR_SPECS: dict = {
    "engine": {
        "engine_rpm_rpm":                     (800.0,   3500.0,  150.0),
        "engine_oil_temperature":             (75.0,    115.0,   2.0),
        "ecu_7ea_engine_coolant_temperature": (78.0,    102.0,   1.5),
        "engine_load_absolute":               (10.0,    80.0,    4.0),
        "fuel_flow_rate_hour_l_hr":           (2.5,     14.0,    0.8),
        "turbo_boost_vacuum_gauge_psi":       (-3.0,    14.0,    0.8),
        "voltage_control_module_v":           (13.0,    14.5,    0.05),
    },
    "battery": {
        "battery_state_of_charge_soc_pct":    (20.0,    96.0,    2.0),
        "battery_state_of_health_soh_pct":    (88.0,    100.0,   0.1),
        "battery_voltage_ecu_7ee":            (12.0,    14.6,    0.15),
        "battery_temperature_cell":           (18.0,    45.0,    1.5),
        "internal_resistance_impedance":      (0.005,   0.018,   0.001),
        "charging_power_kw":                  (0.0,     7.2,     0.3),
        "hv_battery_pack_voltage":            (360.0,   420.0,   4.0),
    },
    "body": {
        "cabin_temperature":                  (18.0,    28.0,    0.8),
        "fuel_level_pct":                     (8.0,     100.0,   2.0),
        "cabin_humidity_pct":                 (30.0,    70.0,    2.0),
        "hvac_blower_speed":                  (0.0,     100.0,   5.0),
        "ac_compressor_load_pct":             (0.0,     80.0,    4.0),
        "distance_since_codes_cleared":       (0.0,     15000.0, 10.0),
        "odometer_reading":                   (38000.0, 80000.0, 0.0),
    },
    "transmission": {
        "transmission_oil_temperature":       (50.0,    100.0,   2.0),
        "gear_position_actual":               (1.0,     6.0,     0.5),
        "torque_converter_slip_speed":        (0.0,     100.0,   4.0),
        "vehicle_speed_kmh":                  (0.0,     120.0,   6.0),
        "actual_engine_pct_torque":           (5.0,     90.0,    4.0),
        "clutch_engagement_per_slip":         (0.2,     9.0,     0.4),
        "engine_rpm":                         (800.0,   3500.0,  150.0),
    },
    "tyre": {
        "tyre_pressure_fl_psi":               (30.0,    37.0,    0.2),
        "tyre_pressure_fr_psi":               (30.0,    37.0,    0.2),
        "tyre_pressure_rl_psi":               (30.0,    37.0,    0.2),
        "tyre_pressure_rr_psi":               (30.0,    37.0,    0.2),
        "tyre_temp_fl_c":                     (28.0,    80.0,    3.0),
        "tyre_temp_fr_c":                     (28.0,    80.0,    3.0),
        "tyre_wear_fl_pct":                   (60.0,    100.0,   0.05),
        "tyre_wear_fr_pct":                   (60.0,    100.0,   0.05),
        "tyre_wear_rl_pct":                   (60.0,    100.0,   0.05),
        "tyre_wear_rr_pct":                   (60.0,    100.0,   0.05),
    },
}

_IDLE_SENSORS = {
    "vehicle_speed_kmh", "engine_rpm_rpm", "engine_rpm",
    "engine_load_absolute", "actual_engine_pct_torque",
    "fuel_flow_rate_hour_l_hr", "torque_converter_slip_speed",
}


def _generate_sensor_history(vehicle_id: str, module: str, n_points: int = 960) -> list:
    try:
        import numpy as np
    except ImportError:
        return []

    specs = _KEY_SENSOR_SPECS.get(module, {})
    if not specs:
        return []

    rng = np.random.default_rng(seed=abs(hash(vehicle_id + module)) % (2 ** 31))
    end_ts = pd.Timestamp.now(tz="UTC") - pd.Timedelta(minutes=5)
    start_ts = end_ts - pd.Timedelta(days=10)
    timestamps = pd.date_range(start=start_ts, end=end_ts, periods=n_points)

    base_odo = float(rng.uniform(38000, 65000))
    km_per_step = float(rng.uniform(0.9, 2.1))

    states = {k: (lo + hi) / 2.0 for k, (lo, hi, _noise) in specs.items()}
    if "odometer_reading" in states:
        states["odometer_reading"] = base_odo

    rows = []
    for i, ts in enumerate(timestamps):
        is_driving = bool(rng.random() > 0.35)
        row: dict = {
            "timestamp": ts.strftime("%Y-%m-%d %H:%M"),
            "source_id": vehicle_id,
            "mileage": round(base_odo + i * km_per_step, 1),
        }
        for col, (lo, hi, noise) in specs.items():
            if col == "odometer_reading":
                states[col] = base_odo + i * km_per_step
                row[col] = round(states[col], 1)
                continue
            if not is_driving and col in _IDLE_SENSORS:
                states[col] = max(lo, states[col] * 0.15)
            states[col] = float(np.clip(states[col] + float(rng.normal(0, noise)), lo, hi))
            row[col] = round(states[col], 3)
        rows.append(row)

    return rows


_DEMO_SILVER_CACHE: dict = {}
_DEMO_VEHICLE_HEALTH_CACHE: dict = {}

_SILVER_TOP_FEATURES: dict = {
    "engine":       ["engine_rpm_rpm", "engine_oil_temperature", "ecu_7ea_engine_coolant_temperature", "engine_load_absolute", "fuel_flow_rate_hour_l_hr"],
    "battery":      ["battery_state_of_charge_soc_pct", "battery_temperature_cell", "internal_resistance_impedance", "battery_state_of_health_soh_pct", "hv_battery_pack_voltage"],
    "body":         ["fuel_level_pct", "cabin_temperature", "ac_compressor_load_pct", "cabin_humidity_pct"],
    "transmission": ["transmission_oil_temperature", "torque_converter_slip_speed", "clutch_engagement_per_slip", "vehicle_speed_kmh"],
    "tyre":         ["tyre_pressure_fl_psi", "tyre_pressure_fr_psi", "tyre_wear_fl_pct", "tyre_temp_fl_c"],
}


def _generate_silver_history(vehicle_id: str, module: str, bronze_rows: list) -> list:
    try:
        import numpy as np
    except ImportError:
        return []
    if not bronze_rows:
        return []

    rng = np.random.default_rng(seed=abs(hash(vehicle_id + module + "silver")) % (2 ** 31))
    features = _SILVER_TOP_FEATURES.get(module, [])

    health_state = float(rng.uniform(82, 96))
    rows = []
    for bronze_row in bronze_rows:
        health_state += float(rng.normal(0, 1.8))
        if health_state < 65:
            health_state += float(rng.uniform(3, 7))
        health_state = float(np.clip(health_state, 40, 100))

        severity = "NORMAL" if health_state >= 80 else ("WARNING" if health_state >= 60 else "CRITICAL")

        top_f = {f: round(float(rng.uniform(0.05, 0.45)), 2) for f in features[:3]}
        rows.append({
            "timestamp": bronze_row["timestamp"],
            "source_id": vehicle_id,
            "mileage": bronze_row["mileage"],
            "health_score": round(health_state, 2),
            "severity": severity,
            "top_features": json.dumps(top_f),
        })
    return rows


def _generate_vehicle_health_history(silver_by_module: dict) -> list:
    if not silver_by_module:
        return []
    mod_lists = [v for v in silver_by_module.values() if v]
    if not mod_lists:
        return []
    n = min(len(lst) for lst in mod_lists)
    WEIGHTS = {"engine": 0.35, "transmission": 0.25, "battery": 0.20, "body": 0.10, "tyre": 0.10}
    rows = []
    ref_list = mod_lists[0]
    for i in range(n):
        mod_scores: dict = {}
        fused = 0.0
        for mod, lst in silver_by_module.items():
            if i < len(lst):
                h = lst[i]["health_score"]
                mod_scores[mod] = h
                fused += h * WEIGHTS.get(mod, 0.2)
        ts = ref_list[i]["timestamp"]
        row: dict = {
            "ts": ts[5:16],
            "timestamp": ts,
            "mileage": ref_list[i]["mileage"],
            "health": round(fused, 2),
        }
        for mod, h in mod_scores.items():
            row[f"{mod}_contrib"] = round(h, 2)
        rows.append(row)
    return rows


def _seed_all_demo_data() -> None:
    global _DEMO_SEED_CACHE, _DEMO_SILVER_CACHE, _DEMO_VEHICLE_HEALTH_CACHE
    _DEMO_SEED_CACHE = {}
    _DEMO_SILVER_CACHE = {}
    _DEMO_VEHICLE_HEALTH_CACHE = {}
    for vid in _DEMO_VEHICLES:
        _DEMO_SEED_CACHE[vid] = {}
        _DEMO_SILVER_CACHE[vid] = {}
        for mod in VEHICLE_MODULES:
            bronze = _generate_sensor_history(vid, mod)
            _DEMO_SEED_CACHE[vid][mod] = bronze
            _DEMO_SILVER_CACHE[vid][mod] = _generate_silver_history(vid, mod, bronze)
        _DEMO_VEHICLE_HEALTH_CACHE[vid] = _generate_vehicle_health_history(_DEMO_SILVER_CACHE[vid])


@app.post("/api/automotive/demo/activate")
def activate_presentation_mode():
    global _PRESENTATION_MODE_ACTIVE
    _PRESENTATION_MODE_ACTIVE = True
    _seed_all_demo_data()
    bronze_rows = sum(len(rows) for vd in _DEMO_SEED_CACHE.values() for rows in vd.values())
    silver_rows = sum(len(rows) for vd in _DEMO_SILVER_CACHE.values() for rows in vd.values())
    return {
        "status": "activated",
        "vehicles": _DEMO_VEHICLES,
        "bronze_rows_seeded": bronze_rows,
        "silver_rows_seeded": silver_rows,
        "days_of_history": 10,
    }


@app.get("/api/automotive/demo/status")
def get_presentation_mode_status():
    return {
        "active": _PRESENTATION_MODE_ACTIVE,
        "vehicles": list(_DEMO_SEED_CACHE.keys()) if _PRESENTATION_MODE_ACTIVE else [],
    }


@app.get("/api/automotive/fleet-summary")
def get_automotive_fleet_summary():
    vehicles_out: list = []
    gold_vehicle_map: dict = {}

    if os.path.exists(GOLD_ROOT):
        gfiles = _recent_parquets(GOLD_ROOT, 10)
        dfs = []
        for fp in gfiles:
            try:
                df = pd.read_parquet(fp)
                if not df.empty:
                    dfs.append(df)
            except Exception:
                pass
        if dfs:
            gdf = pd.concat(dfs, ignore_index=True)
            if "gold_window_ts" in gdf.columns and "source_id" in gdf.columns:
                gdf["gold_window_ts"] = pd.to_datetime(gdf["gold_window_ts"])
                latest = gdf.sort_values("gold_window_ts").groupby("source_id").last().reset_index()
                for _, row in latest.iterrows():
                    entry: dict = {
                        "vehicle_id": str(row.get("source_id", "")),
                        "health_score": round(float(row.get("vehicle_health_score", 0)), 1),
                        "data_source": "live",
                    }
                    for mod in VEHICLE_MODULES:
                        entry[f"{mod}_contrib"] = round(float(row.get(f"{mod}_contrib", 0)), 2)
                    gold_vehicle_map[entry["vehicle_id"]] = entry

    if gold_vehicle_map:
        vehicles_out = list(gold_vehicle_map.values())
    elif _PRESENTATION_MODE_ACTIVE and _DEMO_SEED_CACHE:
        try:
            import numpy as np
            _np_ok = True
        except ImportError:
            _np_ok = False

        for vid in _DEMO_VEHICLES:
            if _np_ok:
                import numpy as np
                rng = np.random.default_rng(seed=abs(hash(vid)) % (2 ** 31))
                health = round(float(rng.uniform(65, 95)), 1)
                entry = {"vehicle_id": vid, "health_score": health, "data_source": "demo"}
                remaining = 1.0
                mods = VEHICLE_MODULES[:]
                for idx, mod in enumerate(mods):
                    if idx == len(mods) - 1:
                        entry[f"{mod}_contrib"] = round(max(0, remaining), 3)
                    else:
                        share = round(float(rng.uniform(0.10, 0.28)), 3)
                        share = min(share, remaining)
                        entry[f"{mod}_contrib"] = share
                        remaining -= share
            else:
                entry = {
                    "vehicle_id": vid,
                    "health_score": 80.0,
                    "data_source": "demo",
                    **{f"{mod}_contrib": 0.2 for mod in VEHICLE_MODULES},
                }
            vehicles_out.append(entry)

    health_scores = [v["health_score"] for v in vehicles_out if v.get("health_score") is not None]
    return {
        "vehicles": vehicles_out,
        "fleet_stats": {
            "total_vehicles": len(vehicles_out),
            "avg_health": round(sum(health_scores) / len(health_scores), 1) if health_scores else 0,
            "critical_count": sum(1 for h in health_scores if h < 60),
            "warning_count": sum(1 for h in health_scores if 60 <= h < 80),
            "demo_active": _PRESENTATION_MODE_ACTIVE,
        },
    }


@app.get("/api/automotive/sensor-history/{vehicle_id}/{module}")
def get_automotive_sensor_history(vehicle_id: str, module: str):
    if module not in VEHICLE_MODULES:
        raise HTTPException(status_code=400, detail="Invalid module")

    rows: list = []
    data_source = "none"

    bronze_path = os.path.join(DELTA_ROOT, module)
    if os.path.exists(bronze_path):
        pfiles = sorted(
            [os.path.join(r, f) for r, _d, ff in os.walk(bronze_path) for f in ff if f.endswith(".parquet")],
            key=os.path.getmtime, reverse=True,
        )
        dfs = []
        for fp in pfiles[:20]:
            try:
                df = pd.read_parquet(fp)
                if not df.empty and "source_id" in df.columns:
                    vdf = df[df["source_id"] == vehicle_id]
                    if not vdf.empty:
                        dfs.append(vdf)
            except Exception:
                pass

        if dfs:
            combined = pd.concat(dfs, ignore_index=True)
            ts_col = next((c for c in ("timestamp", "ingest_ts") if c in combined.columns), None)
            if ts_col:
                combined["timestamp"] = pd.to_datetime(combined[ts_col]).dt.strftime("%Y-%m-%d %H:%M")
            else:
                combined["timestamp"] = combined.index.astype(str)

            combined = combined.fillna(0)

            if module != "body":
                body_path = os.path.join(DELTA_ROOT, "body")
                if os.path.exists(body_path):
                    bfiles = sorted(
                        [os.path.join(r, f) for r, _d, ff in os.walk(body_path) for f in ff if f.endswith(".parquet")],
                        key=os.path.getmtime, reverse=True,
                    )
                    bdfs = []
                    for fp in bfiles[:20]:
                        try:
                            bdf = pd.read_parquet(fp)
                            if not bdf.empty and "source_id" in bdf.columns and "odometer_reading" in bdf.columns:
                                vbdf = bdf[bdf["source_id"] == vehicle_id].copy()
                                btc = next((c for c in ("timestamp", "ingest_ts") if c in vbdf.columns), None)
                                if btc:
                                    vbdf["timestamp"] = pd.to_datetime(vbdf[btc]).dt.strftime("%Y-%m-%d %H:%M")
                                    bdfs.append(vbdf[["timestamp", "odometer_reading"]])
                        except Exception:
                            pass
                    if bdfs:
                        body_merged = pd.concat(bdfs, ignore_index=True).drop_duplicates("timestamp")
                        combined = combined.merge(body_merged, on="timestamp", how="left")
                        combined["mileage"] = combined["odometer_reading"].fillna(0)

            if "mileage" not in combined.columns:
                combined["mileage"] = range(len(combined))

            CHART_SENSORS = {
                "engine": ["engine_rpm_rpm", "ecu_7ea_engine_coolant_temperature", "engine_oil_temperature", "engine_load_absolute", "fuel_flow_rate_hour_l_hr", "turbo_boost_vacuum_gauge_psi", "voltage_control_module_v"],
                "battery": ["battery_state_of_charge_soc_pct", "battery_state_of_health_soh_pct", "battery_voltage_ecu_7ee", "hv_battery_pack_voltage", "battery_temperature_cell", "internal_resistance_impedance", "charging_power_kw"],
                "body": ["fuel_level_pct", "cabin_temperature", "cabin_humidity_pct", "hvac_blower_speed", "ac_compressor_load_pct", "odometer_reading"],
                "transmission": ["transmission_oil_temperature", "vehicle_speed_kmh", "actual_engine_pct_torque", "gear_position_actual", "clutch_engagement_per_slip", "torque_converter_slip_speed"],
                "tyre": ["tyre_pressure_fl_psi", "tyre_pressure_fr_psi", "tyre_pressure_rl_psi", "tyre_pressure_rr_psi", "tyre_temp_fl_c", "tyre_temp_fr_c", "tyre_wear_fl_pct", "tyre_wear_fr_pct", "tyre_wear_rl_pct", "tyre_wear_rr_pct"],
            }
            wanted = set(CHART_SENSORS.get(module, []))
            numeric_cols = [c for c in combined.columns if c in wanted]
            keep = ["timestamp", "source_id", "mileage"] + numeric_cols
            combined = combined[[c for c in keep if c in combined.columns]]
            combined = combined.sort_values("timestamp")

            for col in combined.select_dtypes(include=["datetime64[ns]", "datetime64[ns, UTC]"]).columns:
                combined[col] = combined[col].astype(str)

            max_points = 10000
            if len(combined) > max_points:
                step = len(combined) // max_points
                sampled = combined.iloc[::step]
                if combined.iloc[-1].name not in sampled.index:
                    sampled = pd.concat([sampled, combined.iloc[[-1]]])
                combined = sampled
            rows = combined.to_dict(orient="records")
            data_source = "live"

    if not rows and _PRESENTATION_MODE_ACTIVE and vehicle_id in _DEMO_SEED_CACHE:
        rows = _DEMO_SEED_CACHE[vehicle_id].get(module, [])
        data_source = "demo"

    return {
        "data": rows,
        "data_source": data_source,
        "vehicle_id": vehicle_id,
        "module": module,
        "count": len(rows),
    }


@app.get("/api/automotive/module-crossfleet/{module}")
def get_automotive_module_crossfleet(module: str):
    if module not in VEHICLE_MODULES:
        raise HTTPException(status_code=400, detail="Invalid module")

    specs = _KEY_SENSOR_SPECS.get(module, {})
    sensor_keys = list(specs.keys())
    vehicle_stats: list = []

    bronze_path = os.path.join(DELTA_ROOT, module)
    if os.path.exists(bronze_path):
        pfiles = sorted(
            [os.path.join(r, f) for r, _d, ff in os.walk(bronze_path) for f in ff if f.endswith(".parquet")],
            key=os.path.getmtime, reverse=True,
        )
        dfs = []
        for fp in pfiles[:30]:
            try:
                df = pd.read_parquet(fp)
                if not df.empty:
                    dfs.append(df)
            except Exception:
                pass

        if dfs:
            combined = pd.concat(dfs, ignore_index=True)
            if "source_id" in combined.columns:
                for vid, grp in combined.groupby("source_id"):
                    stat: dict = {"vehicle_id": str(vid)}
                    for sk in sensor_keys:
                        if sk in grp.columns:
                            stat[f"{sk}_avg"] = round(float(grp[sk].mean()), 3)
                            stat[f"{sk}_min"] = round(float(grp[sk].min()), 3)
                            stat[f"{sk}_max"] = round(float(grp[sk].max()), 3)
                    vehicle_stats.append(stat)

    if not vehicle_stats and _PRESENTATION_MODE_ACTIVE and _DEMO_SEED_CACHE:
        for vid in _DEMO_VEHICLES:
            if vid not in _DEMO_SEED_CACHE or module not in _DEMO_SEED_CACHE[vid]:
                continue
            seed_rows = _DEMO_SEED_CACHE[vid][module]
            if not seed_rows:
                continue
            stat = {"vehicle_id": vid}
            for sk in sensor_keys:
                vals = [r[sk] for r in seed_rows if sk in r and r[sk] is not None]
                if vals:
                    stat[f"{sk}_avg"] = round(sum(vals) / len(vals), 3)
                    stat[f"{sk}_min"] = round(min(vals), 3)
                    stat[f"{sk}_max"] = round(max(vals), 3)
            vehicle_stats.append(stat)

    return {
        "module": module,
        "vehicles": vehicle_stats,
        "sensor_keys": sensor_keys,
    }


def _add_mileage_to_silver(combined: "pd.DataFrame", vehicle_id: str) -> "pd.DataFrame":
    """Joins body Bronze odometer to a Silver dataframe on timestamp (best-effort)."""
    body_path = os.path.join(DELTA_ROOT, "body")
    if not os.path.exists(body_path):
        combined["mileage"] = range(len(combined))
        return combined
    bfiles = sorted(
        [os.path.join(r, f) for r, _d, ff in os.walk(body_path) for f in ff if f.endswith(".parquet")],
        key=os.path.getmtime, reverse=True,
    )
    bdfs = []
    for fp in bfiles[:20]:
        try:
            bdf = pd.read_parquet(fp)
            if not bdf.empty and "source_id" in bdf.columns and "odometer_reading" in bdf.columns:
                vbdf = bdf[bdf["source_id"] == vehicle_id].copy()
                btc = next((c for c in ("timestamp", "ingest_ts") if c in vbdf.columns), None)
                if btc:
                    vbdf["timestamp"] = pd.to_datetime(vbdf[btc]).dt.strftime("%Y-%m-%d %H:%M")
                    bdfs.append(vbdf[["timestamp", "odometer_reading"]])
        except Exception:
            pass
    if bdfs:
        body_merged = pd.concat(bdfs, ignore_index=True).drop_duplicates("timestamp")
        combined = combined.merge(body_merged, on="timestamp", how="left")
        combined["mileage"] = combined["odometer_reading"].fillna(0)
    else:
        combined["mileage"] = range(len(combined))
    return combined


@app.get("/api/automotive/module-health/{vehicle_id}/{module}")
def get_automotive_module_health(vehicle_id: str, module: str):
    """Silver layer: ML health score, severity, and top features per vehicle+module."""
    if module not in VEHICLE_MODULES:
        raise HTTPException(status_code=400, detail="Invalid module")

    rows: list = []
    data_source = "none"

    silver_path = os.path.join(SILVER_ROOT, module)
    if os.path.exists(silver_path):
        pfiles = sorted(
            [os.path.join(r, f) for r, _d, ff in os.walk(silver_path) for f in ff if f.endswith(".parquet")],
            key=os.path.getmtime, reverse=True,
        )
        dfs = []
        for fp in pfiles[:20]:
            try:
                df = pd.read_parquet(fp)
                if not df.empty and "source_id" in df.columns:
                    vdf = df[df["source_id"] == vehicle_id]
                    if not vdf.empty:
                        dfs.append(vdf)
            except Exception:
                pass

        if dfs:
            combined = pd.concat(dfs, ignore_index=True)
            ts_col = next((c for c in ("inference_ts", "ingest_ts", "timestamp") if c in combined.columns), None)
            if ts_col:
                combined["timestamp"] = pd.to_datetime(combined[ts_col]).dt.strftime("%Y-%m-%d %H:%M")
            else:
                combined["timestamp"] = combined.index.astype(str)

            combined = combined.fillna(0)
            combined = _add_mileage_to_silver(combined, vehicle_id)
            combined = combined.sort_values("timestamp")

            keep_base = ["timestamp", "source_id", "mileage"]
            for col in ("health_score", "severity", "top_features"):
                if col in combined.columns:
                    keep_base.append(col)

            for col in combined.select_dtypes(include=["datetime64[ns]", "datetime64[ns, UTC]"]).columns:
                combined[col] = combined[col].astype(str)

            if "top_features" in combined.columns:
                import json as _json
                def _trim_features(raw):
                    try:
                        obj = _json.loads(str(raw))
                        top3 = dict(sorted(obj.items(), key=lambda x: x[1], reverse=True)[:3])
                        return _json.dumps(top3)
                    except Exception:
                        return "{}"
                combined["top_features"] = combined["top_features"].apply(_trim_features)

            out = combined[[c for c in keep_base if c in combined.columns]]
            max_points = 10000
            if len(out) > max_points:
                step = len(out) // max_points
                sampled = out.iloc[::step]
                if out.iloc[-1].name not in sampled.index:
                    sampled = pd.concat([sampled, out.iloc[[-1]]])
                out = sampled
            rows = out.to_dict(orient="records")
            data_source = "live"

    if not rows and _PRESENTATION_MODE_ACTIVE and vehicle_id in _DEMO_SILVER_CACHE:
        rows = _DEMO_SILVER_CACHE[vehicle_id].get(module, [])
        data_source = "demo"

    return {
        "data": rows,
        "data_source": data_source,
        "vehicle_id": vehicle_id,
        "module": module,
        "count": len(rows),
    }


@app.get("/api/automotive/vehicle-health-history/{vehicle_id}")
def get_automotive_vehicle_health_history(vehicle_id: str):
    """Fused vehicle health trend: Gold layer when live, synthetic demo fallback."""
    rows: list = []
    data_source = "none"

    if os.path.exists(GOLD_ROOT):
        gfiles = _recent_parquets(GOLD_ROOT, 20)
        dfs = []
        for fp in gfiles:
            try:
                df = pd.read_parquet(fp)
                if not df.empty and "source_id" in df.columns:
                    vdf = df[df["source_id"] == vehicle_id]
                    if not vdf.empty:
                        dfs.append(vdf)
            except Exception:
                pass

        if dfs:
            combined = pd.concat(dfs, ignore_index=True)
            if "gold_window_ts" in combined.columns:
                combined["gold_window_ts"] = pd.to_datetime(combined["gold_window_ts"], errors="coerce")
                combined = combined.sort_values("gold_window_ts")
                combined["ts"] = combined["gold_window_ts"].dt.strftime("%Y-%m-%d %H:%M").fillna("")
            if "ts" not in combined.columns:
                combined["ts"] = combined.get("gold_write_ts", pd.Series(range(len(combined)), dtype=str))
            combined["timestamp"] = combined["ts"]
            if "mileage" not in combined.columns:
                combined["mileage"] = range(len(combined))
            combined = combined.fillna(0)
            for col in combined.select_dtypes(include=["datetime64[ns]", "datetime64[ns, UTC]"]).columns:
                combined[col] = combined[col].astype(str)
            keep = [c for c in ("ts", "timestamp", "vehicle_health_score", "mileage") if c in combined.columns]
            keep += [c for c in combined.columns if c.endswith("_contrib")]
            out = combined[keep]
            out = out.rename(columns={"vehicle_health_score": "health"})
            max_points = 10000
            if len(out) > max_points:
                step = len(out) // max_points
                sampled = out.iloc[::step]
                if out.iloc[-1].name not in sampled.index:
                    sampled = pd.concat([sampled, out.iloc[[-1]]])
                out = sampled
            rows = out.to_dict(orient="records")
            data_source = "live"

    if not rows and _PRESENTATION_MODE_ACTIVE and vehicle_id in _DEMO_VEHICLE_HEALTH_CACHE:
        rows = _DEMO_VEHICLE_HEALTH_CACHE[vehicle_id]
        data_source = "demo"

    return {
        "data": rows,
        "data_source": data_source,
        "vehicle_id": vehicle_id,
        "count": len(rows),
    }