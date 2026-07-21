
import asyncio
import os
import sys
import json
import time
from threading import Lock
from fastapi import APIRouter, HTTPException, Query

_PROJECT_ROOT_FOR_IMPORT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if _PROJECT_ROOT_FOR_IMPORT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT_FOR_IMPORT)
from common import duck_reader as dr

router = APIRouter()

# ---------------------------------------------------------------------------
# SSE client registry — push-based real-time stream for scatter / timeline.
# Each connected browser gets its own asyncio.Queue. The background precompute
# loop deposits delta payloads via call_soon_threadsafe (thread-safe bridge
# from the executor thread to the event loop). The SSE endpoint drains the
# queue into the response stream.
# ---------------------------------------------------------------------------
from fastapi.responses import StreamingResponse

_sse_clients: list = []          # list[asyncio.Queue]
_sse_clients_lock = Lock()
_sse_event_loop = None           # captured at startup, used for threadsafe put
_sse_last_ts: dict = {}          # vehicle_id -> last broadcast ts (delta tracking)

def _sse_broadcast(payload: str) -> None:
    """Thread-safe: deposit SSE payload into every connected client queue."""
    if not _sse_event_loop or not _sse_clients:
        return
    with _sse_clients_lock:
        clients = list(_sse_clients)
    for q in clients:
        _sse_event_loop.call_soon_threadsafe(q.put_nowait, payload)

# ---------------------------------------------------------------------------
# Background precompute cache — same pattern as WRITER_METRICS_CACHE,
# GOLD_METRICS_CACHE, ALERTS_METRICS_CACHE in the microservices. A
# background loop refreshes every LIVE_CACHE_INTERVAL_SEC so every endpoint
# is a sub-millisecond dict lookup rather than an on-demand DuckDB query.
# On-demand TTL caching (old approach) meant each poll could trigger a slow
# cold DuckDB scan; with precompute the data is always ready.
# ---------------------------------------------------------------------------
_LIVE_CACHE_INTERVAL_SEC = 3.0
_LIVE_CACHE: dict = {}
_LIVE_CACHE_LOCK = Lock()

def _set_live(key: str, value) -> None:
    with _LIVE_CACHE_LOCK:
        _LIVE_CACHE[key] = value

def _get_live(key: str):
    with _LIVE_CACHE_LOCK:
        return _LIVE_CACHE.get(key)

# Legacy per-request TTL cache kept for endpoints not yet covered by the
# background loop (sensor-history, decomposition, etc.)
_response_cache: dict = {}
_cache_lock = Lock()
_RESPONSE_TTL = 5.0
_MAX_CACHE_ENTRIES = 200

def _cached_response(key: str, ttl: float = _RESPONSE_TTL):
    with _cache_lock:
        entry = _response_cache.get(key)
        if entry and (time.monotonic() - entry[0]) < ttl:
            return entry[1]
    return None

def _set_cache(key: str, value):
    now = time.monotonic()
    with _cache_lock:
        _response_cache[key] = (now, value)
        if len(_response_cache) > _MAX_CACHE_ENTRIES:
            oldest_key = min(_response_cache, key=lambda k: _response_cache[k][0])
            del _response_cache[oldest_key]

_PROJECT_ROOT    = _PROJECT_ROOT_FOR_IMPORT
_DELTA_ROOT      = os.path.join(_PROJECT_ROOT, "data", "delta", "bronze")
_SILVER_ROOT     = os.path.join(_PROJECT_ROOT, "data", "delta", "silver")
_GOLD_ROOT       = os.path.join(_PROJECT_ROOT, "data", "delta", "gold", "vehicle_health")
_COMPUTED_ROOT   = os.path.join(_PROJECT_ROOT, "data", "computed")
_BATCH_SILVER_ROOT = os.path.join(_PROJECT_ROOT, "data", "batch", "silver")
_BATCH_GOLD_ROOT   = os.path.join(_PROJECT_ROOT, "data", "batch", "gold", "vehicle_health")
_BATCH_ALERTS_ROOT = os.path.join(_PROJECT_ROOT, "data", "batch", "gold", "alerts")
_pipeline_cfg_path = os.path.join(_PROJECT_ROOT, "config", "pipeline_config.json")
with open(_pipeline_cfg_path, encoding="utf-8") as _fh:
    _VEHICLE_MODULES = sorted(json.load(_fh)["enabled_modules"])
_GOLD_MAX_FILES  = 200
_SILVER_MAX_FILES = 200

from tools.fleet_simulator.fleet_config import VEHICLES as _FLEET_VEHICLES
_HISTORICAL_IDS: frozenset[str] = frozenset(
    v["id"] for v in _FLEET_VEHICLES if v["status"] != "active"
)


def _load_historical_layer(vehicle_id: str, layer: str):
    path = os.path.join(_COMPUTED_ROOT, vehicle_id, f"{layer}.json")
    if not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)

@router.get("/api/config/manifest")
async def get_config_manifest():
    manifest_path = os.path.join(_PROJECT_ROOT, "config", "fleet_manifest.json")
    with open(manifest_path, encoding="utf-8") as fh:
        manifest = json.load(fh)
    return {
        "active_sims":    manifest["active_sims"],
        "historical_sims": manifest["in_service_sims"] + manifest["parked_sims"],
        "enabled_modules": _VEHICLE_MODULES,
    }


# ── Demo / Presentation Mode state ──────────────────────────────────────────

_PRESENTATION_MODE_ACTIVE: bool = False
_DEMO_SEED_CACHE: dict = {}
_DEMO_SILVER_CACHE: dict = {}
_DEMO_VEHICLE_HEALTH_CACHE: dict = {}

_DEMO_VEHICLES: list = [f"sim{i:03d}" for i in range(1, 41)]

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
        "tyre_pressure_fl_psi": (78.0,  105.0,  0.5),
        "tyre_pressure_fr_psi": (78.0,  105.0,  0.5),
        "tyre_pressure_rl_psi": (90.0,  118.0,  0.5),
        "tyre_pressure_rr_psi": (90.0,  118.0,  0.5),
        "tyre_temp_fl_c":       (32.0,   78.0,  1.5),
        "tyre_temp_fr_c":       (32.0,   78.0,  1.5),
        "tyre_temp_rl_c":       (38.0,   85.0,  1.5),
        "tyre_temp_rr_c":       (38.0,   85.0,  1.5),
        "tyre_wear_fl_pct":     (60.0,  100.0,  0.05),
        "tyre_wear_fr_pct":     (60.0,  100.0,  0.05),
        "tyre_wear_rl_pct":     (60.0,  100.0,  0.05),
        "tyre_wear_rr_pct":     (60.0,  100.0,  0.05),
    },
}

_IDLE_SENSORS = {
    "vehicle_speed_kmh", "engine_rpm_rpm", "engine_rpm",
    "engine_load_absolute", "actual_engine_pct_torque",
    "fuel_flow_rate_hour_l_hr", "torque_converter_slip_speed",
}

_SILVER_TOP_FEATURES: dict = {
    "engine":       ["engine_rpm_rpm", "engine_oil_temperature", "ecu_7ea_engine_coolant_temperature", "engine_load_absolute", "fuel_flow_rate_hour_l_hr"],
    "battery":      ["battery_state_of_charge_soc_pct", "battery_temperature_cell", "internal_resistance_impedance", "battery_state_of_health_soh_pct", "hv_battery_pack_voltage"],
    "body":         ["fuel_level_pct", "cabin_temperature", "ac_compressor_load_pct", "cabin_humidity_pct"],
    "transmission": ["transmission_oil_temperature", "torque_converter_slip_speed", "clutch_engagement_per_slip", "vehicle_speed_kmh"],
    "tyre":         ["tyre_pressure_fl_psi", "tyre_pressure_fr_psi", "tyre_wear_fl_pct", "tyre_temp_fl_c"],
}

# ── Demo data generators ─────────────────────────────────────────────────────

def _generate_sensor_history(vehicle_id: str, module: str, n_points: int = 960) -> list:
    import pandas as pd
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
    states = {k: (lo + hi) / 2.0 for k, (lo, hi, _) in specs.items()}
    if "odometer_reading" in states:
        states["odometer_reading"] = base_odo
    rows = []
    for i, ts in enumerate(timestamps):
        is_driving = bool(rng.random() > 0.35)
        row: dict = {
            "timestamp": ts.strftime("%Y-%m-%d %H:%M:%S.%f")[:-3],
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
    ref_list = mod_lists[0]
    rows = []
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
        for mod in _VEHICLE_MODULES:
            bronze = _generate_sensor_history(vid, mod)
            _DEMO_SEED_CACHE[vid][mod] = bronze
            _DEMO_SILVER_CACHE[vid][mod] = _generate_silver_history(vid, mod, bronze)
        _DEMO_VEHICLE_HEALTH_CACHE[vid] = _generate_vehicle_health_history(_DEMO_SILVER_CACHE[vid])


# ── Single-vehicle query helper ──────────────────────────────────────────────
# Pushes the source_id filter into SQL (DuckDB only scans/transfers matching
# rows) and re-applies it in pandas afterward as a no-op-on-the-fast-path
# safety net for query_df()'s unfiltered fallback if DuckDB errors on a file.

def _query_vehicle_df(directory: str, vehicle_id: str, max_files: int, hive: bool = False):
    import pandas as pd
    files = (
        dr.list_partitioned_files(directory, max_files_per_partition=max_files)
        if hive else dr.list_files(directory, max_files=max_files)
    )
    if not files:
        return pd.DataFrame()
    df = dr.query_df(
        "SELECT * FROM read_parquet(?) WHERE source_id = ?", files, params=[vehicle_id], hive_partitioning=hive,
    )
    if not df.empty and "source_id" in df.columns:
        df = df[df["source_id"] == vehicle_id]
    return df


# ── Bronze partition iterator — reads Hive-partitioned source_id=X dirs ──────

def _iter_bronze_by_vehicle(module: str, max_files_per_vehicle: int = 10, columns=None):
    bronze_path = os.path.join(_DELTA_ROOT, module)
    files = dr.list_partitioned_files(bronze_path, max_files_per_partition=max_files_per_vehicle)
    if not files:
        return
    if columns:
        col_list = list(dict.fromkeys(list(columns) + ["source_id"]))
        col_sql = ", ".join(f'"{c}"' for c in col_list)
    else:
        col_sql = "*"
    df = dr.query_df(f"SELECT {col_sql} FROM read_parquet(?)", files, hive_partitioning=True)
    if df.empty or "source_id" not in df.columns:
        return
    for vid, grp in df.groupby("source_id"):
        yield str(vid), grp.reset_index(drop=True)


# ── Mileage join helper ───────────────────────────────────────────────────────

def _attach_mileage(combined, vehicle_id: str):
    import pandas as pd
    body_partition = os.path.join(_DELTA_ROOT, "body", f"source_id={vehicle_id}")
    if not os.path.exists(body_partition):
        combined["mileage"] = range(len(combined))
        return combined
    bfiles = dr.list_files(body_partition, max_files=5)
    body_raw = dr.query_df(
        "SELECT timestamp, ingest_ts, odometer_reading FROM read_parquet(?)", bfiles,
    ) if bfiles else pd.DataFrame()
    bdfs = []
    if not body_raw.empty and "odometer_reading" in body_raw.columns:
        btc = next((c for c in ("timestamp", "ingest_ts") if c in body_raw.columns), None)
        if btc:
            raw_ts = pd.to_datetime(body_raw[btc], errors="coerce", utc=True)
            body_raw["_body_ts"] = raw_ts.dt.tz_convert(None)
            bdfs.append(body_raw[["_body_ts", "odometer_reading"]].dropna(subset=["_body_ts"]))
    if bdfs:
        body_merged = (
            pd.concat(bdfs, ignore_index=True)
            .sort_values("_body_ts")
            .drop_duplicates("_body_ts")
            .reset_index(drop=True)
        )
        # Enforce monotonically increasing odometer regardless of source data quality:
        # sort the odometer values independently so the smallest maps to the earliest
        # timestamp and the largest to the latest. This is a no-op on already-correct
        # data and a safe repair on noisy/random synthetic data.
        body_merged["odometer_reading"] = sorted(body_merged["odometer_reading"].values)
        odo_base = float(body_merged["odometer_reading"].iloc[0])

        combined["_comb_ts"] = pd.to_datetime(combined["timestamp"], errors="coerce")
        combined_sorted = combined.sort_values("_comb_ts").copy()
        merged = pd.merge_asof(
            combined_sorted,
            body_merged.rename(columns={"_body_ts": "_comb_ts"}),
            on="_comb_ts",
            direction="nearest",
            tolerance=pd.Timedelta("10min"),
        )
        merged = merged.drop(columns=["_comb_ts"])
        combined = merged
        if combined.get("odometer_reading") is not None and combined["odometer_reading"].notna().any():
            raw = combined["odometer_reading"].ffill().bfill().fillna(odo_base)
            combined["mileage"] = raw.round(1)
        else:
            odo_max = float(body_merged["odometer_reading"].max())
            n = len(combined)
            total = max(odo_max - odo_base, 0.0)
            combined["mileage"] = [round(odo_base + total * i / max(n - 1, 1), 1) for i in range(n)]
    else:
        combined["mileage"] = range(len(combined))
    return combined


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/api/automotive/demo/activate")
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


@router.get("/api/automotive/demo/status")
def get_presentation_mode_status():
    return {
        "active": _PRESENTATION_MODE_ACTIVE,
        "vehicles": list(_DEMO_SEED_CACHE.keys()) if _PRESENTATION_MODE_ACTIVE else [],
    }


@router.get("/api/automotive/fleet-health-scatter")
def get_fleet_health_scatter(limit: int = Query(default=600, ge=50, le=3600)):
    """Batch scatter endpoint — returns health history for ALL vehicles in one
    response. Replaces the 7-way Promise.all fan-out in FleetCenter that fired
    7 concurrent vehicle-health-history requests every 5 s with payloads that
    grew with stream duration. This is a pure in-memory read from the live
    precompute cache — sub-millisecond regardless of Gold file count."""
    with _LIVE_CACHE_LOCK:
        keys = [k for k in _LIVE_CACHE if k.startswith("vehicle-health-")]
    vehicles = []
    scatter: dict = {}
    for key in keys:
        cached = _get_live(key)
        if not cached:
            continue
        vid = key[len("vehicle-health-"):]
        data = cached.get("data", [])
        if limit < len(data):
            data = data[-limit:]
        vehicles.append({"vehicle_id": vid, "data": data, "count": len(data)})
        scatter[vid] = data
    fleet_summary_cached = _get_live("fleet-summary")
    vehicle_streams = fleet_summary_cached.get("vehicles", []) if fleet_summary_cached else []
    return {"vehicles": vehicles, "scatter": scatter, "vehicle_streams": vehicle_streams}


@router.get("/api/automotive/stream")
async def automotive_sse_stream():
    """SSE endpoint — pushes gold_delta events as the precompute loop fires.
    Each event contains only the new Gold records since the previous cycle
    (~3 s interval), so payload stays tiny regardless of stream duration.
    Clients accumulate into a local ring buffer and extend charts with new
    points only — no full re-render, constant CPU cost."""
    queue: asyncio.Queue = asyncio.Queue()
    with _sse_clients_lock:
        _sse_clients.append(queue)

    async def event_generator():
        try:
            while True:
                try:
                    data = await asyncio.wait_for(queue.get(), timeout=25.0)
                    yield f"data: {data}\n\n"
                except asyncio.TimeoutError:
                    yield ": ping\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            with _sse_clients_lock:
                try:
                    _sse_clients.remove(queue)
                except ValueError:
                    pass

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@router.get("/api/automotive/fleet-summary")
def get_automotive_fleet_summary():
    live = _get_live("fleet-summary")
    if live is not None:
        return live
    cached = _cached_response("fleet-summary", ttl=3.0)
    if cached is not None:
        return cached
    import pandas as pd
    vehicles_out: list = []
    gold_vehicle_map: dict = {}

    if os.path.exists(_GOLD_ROOT):
        gfiles = dr.list_files(_GOLD_ROOT, max_files=_GOLD_MAX_FILES)
        gdf = dr.query_df("SELECT * FROM read_parquet(?)", gfiles) if gfiles else pd.DataFrame()
        if not gdf.empty:
            if "gold_window_ts" in gdf.columns and "source_id" in gdf.columns:
                gdf["gold_window_ts"] = pd.to_datetime(gdf["gold_window_ts"])
                # Gold is append-only — ties on gold_window_ts (same window
                # touched more than once) must be broken by actual write
                # order, not left to sort stability, or .last() can return a
                # stale duplicate instead of the most recently written one.
                sort_cols = ["gold_window_ts"]
                if "gold_write_ts" in gdf.columns:
                    sort_cols.append("gold_write_ts")
                latest = gdf.sort_values(sort_cols).groupby("source_id").last().reset_index()
                for _, row in latest.iterrows():
                    entry: dict = {
                        "vehicle_id": str(row.get("source_id", "")),
                        "health_score": round(float(row.get("vehicle_health_score", 0)), 1),
                        "data_source": "live",
                    }
                    for mod in _VEHICLE_MODULES:
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
                for mod in _VEHICLE_MODULES:
                    entry[f"{mod}_contrib"] = round(float(rng.uniform(55, 100)), 1)
            else:
                entry = {
                    "vehicle_id": vid,
                    "health_score": 80.0,
                    "data_source": "demo",
                    **{f"{mod}_contrib": 80.0 for mod in _VEHICLE_MODULES},
                }
            vehicles_out.append(entry)

    health_scores = [v["health_score"] for v in vehicles_out if v.get("health_score") is not None]
    result = {
        "vehicles": vehicles_out,
        "fleet_stats": {
            "total_vehicles": len(vehicles_out),
            "avg_health": round(sum(health_scores) / len(health_scores), 1) if health_scores else 0,
            "critical_count": sum(1 for h in health_scores if h < 60),
            "warning_count": sum(1 for h in health_scores if 60 <= h < 80),
            "demo_active": _PRESENTATION_MODE_ACTIVE,
        },
    }
    _set_cache("fleet-summary", result)
    return result


@router.get("/api/automotive/sensor-history/{vehicle_id}/{module}")
def get_automotive_sensor_history(vehicle_id: str, module: str):
    cache_key = f"sensor-history-{vehicle_id}-{module}"
    cached = _cached_response(cache_key, ttl=60.0)
    if cached is not None:
        return cached
    import pandas as pd
    if module not in _VEHICLE_MODULES:
        raise HTTPException(status_code=400, detail="Invalid module")

    rows: list = []
    data_source = "none"

    partition_path = os.path.join(_DELTA_ROOT, module, f"source_id={vehicle_id}")
    if os.path.exists(partition_path):
        pfiles = dr.list_files(partition_path, max_files=20)
        combined = dr.query_df("SELECT * FROM read_parquet(?)", pfiles) if pfiles else pd.DataFrame()

        if not combined.empty:
            combined["source_id"] = vehicle_id
            ts_col = next((c for c in ("timestamp", "ingest_ts") if c in combined.columns), None)
            if ts_col:
                combined["timestamp"] = pd.to_datetime(combined[ts_col]).dt.strftime("%Y-%m-%d %H:%M:%S.%f").str[:-3]
            else:
                combined["timestamp"] = combined.index.astype(str)
            combined = combined.fillna(0)
            if module == "body" and "odometer_reading" in combined.columns and combined["odometer_reading"].notna().any():
                combined = combined.sort_values("timestamp").reset_index(drop=True)
                odo_sorted = pd.Series(
                    sorted(combined["odometer_reading"].values),
                    index=combined.index,
                )
                combined["mileage"] = odo_sorted.round(1)
            elif module != "body":
                combined = _attach_mileage(combined, vehicle_id)
            if "mileage" not in combined.columns:
                combined["mileage"] = range(len(combined))
            numeric_cols = [c for c in combined.columns if combined[c].dtype.kind in ("f", "i") and c != "mileage"]
            keep = ["timestamp", "source_id", "mileage"] + numeric_cols
            combined = combined[[c for c in keep if c in combined.columns]].sort_values("timestamp")
            for col in combined.select_dtypes(include=["datetime64[ns]", "datetime64[ns, UTC]"]).columns:
                combined[col] = combined[col].astype(str)
            rows = combined.tail(2000).to_dict(orient="records")
            data_source = "live"

    if not rows and _PRESENTATION_MODE_ACTIVE and vehicle_id in _DEMO_SEED_CACHE:
        rows = _DEMO_SEED_CACHE[vehicle_id].get(module, [])
        data_source = "demo"

    result = {"data": rows, "data_source": data_source, "vehicle_id": vehicle_id, "module": module, "count": len(rows)}
    _set_cache(cache_key, result)
    return result


@router.get("/api/automotive/module-health/{vehicle_id}/{module}")
def get_automotive_module_health(vehicle_id: str, module: str):
    cache_key = f"module-health-{vehicle_id}-{module}"
    cached = _cached_response(cache_key, ttl=3.0)
    if cached is not None:
        return cached
    import pandas as pd
    if module not in _VEHICLE_MODULES:
        raise HTTPException(status_code=400, detail="Invalid module")

    rows: list = []
    data_source = "none"

    if vehicle_id in _HISTORICAL_IDS:
        _bp = os.path.join(_BATCH_SILVER_ROOT, module, f"source_id={vehicle_id}", "silver.parquet")
        combined = pd.read_parquet(_bp) if os.path.exists(_bp) else pd.DataFrame()
    else:
        _sp = os.path.join(_SILVER_ROOT, module)
        combined = _query_vehicle_df(_sp, vehicle_id, _SILVER_MAX_FILES) if os.path.exists(_sp) else pd.DataFrame()

    if not combined.empty:
        ts_col = next((c for c in ("inference_ts", "ingest_ts", "timestamp") if c in combined.columns), None)
        if ts_col:
            combined["timestamp"] = pd.to_datetime(combined[ts_col]).dt.strftime("%Y-%m-%d %H:%M:%S.%f").str[:-3]
        else:
            combined["timestamp"] = combined.index.astype(str)
        combined = combined.fillna(0)
        combined = _attach_mileage(combined, vehicle_id)
        combined = combined.sort_values("timestamp")
        keep = ["timestamp", "source_id", "mileage"]
        for col in ("health_score", "severity", "top_features"):
            if col in combined.columns:
                keep.append(col)
        for col in combined.select_dtypes(include=["datetime64[ns]", "datetime64[ns, UTC]"]).columns:
            combined[col] = combined[col].astype(str)
        rows = combined[[c for c in keep if c in combined.columns]].tail(2000).to_dict(orient="records")
        data_source = "batch" if vehicle_id in _HISTORICAL_IDS else "live"

    if not rows and _PRESENTATION_MODE_ACTIVE and vehicle_id in _DEMO_SILVER_CACHE:
        rows = _DEMO_SILVER_CACHE[vehicle_id].get(module, [])
        data_source = "demo"

    result = {"data": rows, "data_source": data_source, "vehicle_id": vehicle_id, "module": module, "count": len(rows)}
    _set_cache(cache_key, result)
    return result


@router.get("/api/automotive/vehicle-health-history/{vehicle_id}")
def get_automotive_vehicle_health_history(
    vehicle_id: str,
    limit: int = Query(default=600, ge=50, le=3600),
):
    cache_key = f"vehicle-health-{vehicle_id}"
    live = _get_live(cache_key)
    if live is not None:
        d = live
        if limit < len(d.get("data", [])):
            d = {**d, "data": d["data"][-limit:], "count": limit}
        return d
    cached = _cached_response(cache_key, ttl=3.0)
    if cached is not None:
        return cached
    import pandas as pd
    rows: list = []
    data_source = "none"

    if vehicle_id in _HISTORICAL_IDS:
        _bf = os.path.join(_BATCH_GOLD_ROOT, f"{vehicle_id}.parquet")
        combined = pd.read_parquet(_bf) if os.path.exists(_bf) else pd.DataFrame()
    else:
        combined = _query_vehicle_df(_GOLD_ROOT, vehicle_id, _GOLD_MAX_FILES) if os.path.exists(_GOLD_ROOT) else pd.DataFrame()

    if not combined.empty:
        if "gold_window_ts" in combined.columns:
            combined["gold_window_ts"] = pd.to_datetime(combined["gold_window_ts"])
            # Gold is append-only — the same (source_id, window) gets a
            # new row every time that window's state is touched, not just
            # once. Without dedup the scatter/timeline plots show multiple
            # stacked points per window instead of one (confirmed on real
            # data: 337 rows for only 98 unique windows).
            sort_col = "gold_write_ts" if "gold_write_ts" in combined.columns else "gold_window_ts"
            combined = combined.sort_values(sort_col).drop_duplicates(subset=["gold_window_ts"], keep="last")
            combined = combined.sort_values("gold_window_ts")
            combined["ts"] = combined["gold_window_ts"].dt.strftime("%Y-%m-%d %H:%M:%S.%f")
        if "ts" not in combined.columns:
            combined["ts"] = combined.index.astype(str)
        combined["timestamp"] = combined["ts"]
        combined = _attach_mileage(combined, vehicle_id)
        combined = combined.fillna(0)
        if "mileage" in combined.columns:
            first_mileage = combined["mileage"].iloc[0]
            combined["mileage_rel"] = (combined["mileage"] - first_mileage).round(1)
        for col in combined.select_dtypes(include=["datetime64[ns]", "datetime64[ns, UTC]"]).columns:
            combined[col] = combined[col].astype(str)

        keep = [c for c in ("ts", "vehicle_health_score", "mileage", "mileage_rel") if c in combined.columns]
        keep += [c for c in combined.columns if c.endswith("_contrib")]
        out = combined[keep].tail(limit).rename(columns={"vehicle_health_score": "health"})
        rows = out.to_dict(orient="records")
        data_source = "batch" if vehicle_id in _HISTORICAL_IDS else "live"

    if not rows and _PRESENTATION_MODE_ACTIVE and vehicle_id in _DEMO_VEHICLE_HEALTH_CACHE:
        rows = _DEMO_VEHICLE_HEALTH_CACHE[vehicle_id]
        data_source = "demo"

    result = {"data": rows, "data_source": data_source, "vehicle_id": vehicle_id, "count": len(rows)}
    _set_cache(cache_key, result)
    return result


@router.get("/api/automotive/vehicle-decomposition/{vehicle_id}")
def get_vehicle_module_decomposition(vehicle_id: str):
    cache_key = f"decomp-{vehicle_id}"
    cached = _cached_response(cache_key, ttl=60.0)
    if cached is not None:
        return cached
    import pandas as pd
    import logging
    _log = logging.getLogger(__name__)

    def _to_ts_naive(series: "pd.Series") -> "pd.Series":
        parsed = pd.to_datetime(series, errors="coerce", utc=True)
        return parsed.dt.tz_convert(None)

    mod_series: dict = {}
    for mod in _VEHICLE_MODULES:
        silver_path = os.path.join(_SILVER_ROOT, mod)
        if not os.path.exists(silver_path):
            continue
        combined = _query_vehicle_df(silver_path, vehicle_id, _SILVER_MAX_FILES)
        if combined.empty or "health_score" not in combined.columns:
            continue
        try:
            ts_col = next((c for c in ("timestamp", "ingest_ts", "inference_ts") if c in combined.columns), None)
            if not ts_col:
                continue
            combined["_ts"] = _to_ts_naive(combined[ts_col])
            combined = combined.dropna(subset=["_ts"]).sort_values("_ts").reset_index(drop=True)
            if combined.empty:
                continue
            factor = max(1, len(combined) // 400)
            if factor > 1:
                combined = combined.iloc[::factor].reset_index(drop=True)
            mod_series[mod] = combined[["_ts", "health_score"]].rename(columns={"health_score": f"{mod}_contrib"})
        except Exception as exc:
            _log.warning(f"vehicle-decomposition: skipping {mod} for {vehicle_id}: {exc}")
            continue

    if not mod_series:
        r = {"data": [], "vehicle_id": vehicle_id}
        _set_cache(cache_key, r)
        return r

    try:
        mods = list(mod_series.keys())
        result = mod_series[mods[0]].sort_values("_ts").reset_index(drop=True)
        for mod in mods[1:]:
            other = mod_series[mod].sort_values("_ts").reset_index(drop=True)
            result = pd.merge_asof(
                result, other, on="_ts", direction="nearest", tolerance=pd.Timedelta("10min")
            )
        result = result.fillna(100.0)
        result["ts"] = result["_ts"].dt.strftime("%Y-%m-%d %H:%M:%S.%f").str[:-3]
        result["timestamp"] = result["ts"]
        result = result.drop(columns=["_ts"]).tail(2000)
        result = _attach_mileage(result, vehicle_id)
        if "mileage" in result.columns:
            result["mileage"] = result["mileage"].fillna(0)
        r = {"data": result.to_dict(orient="records"), "vehicle_id": vehicle_id}
        _set_cache(cache_key, r)
        return r
    except Exception as exc:
        _log.warning(f"vehicle-decomposition: merge failed for {vehicle_id}: {exc}")
        first = list(mod_series.values())[0].copy()
        first["ts"] = first["_ts"].dt.strftime("%Y-%m-%d %H:%M:%S.%f").str[:-3]
        first["timestamp"] = first["ts"]
        first = first.drop(columns=["_ts"]).tail(2000)
        for m in _VEHICLE_MODULES:
            if f"{m}_contrib" not in first.columns:
                first[f"{m}_contrib"] = 100.0
        first = _attach_mileage(first, vehicle_id)
        if "mileage" in first.columns:
            first["mileage"] = first["mileage"].fillna(0)
        r = {"data": first.to_dict(orient="records"), "vehicle_id": vehicle_id}
        _set_cache(cache_key, r)
        return r


@router.get("/api/automotive/module-crossfleet/{module}")
def get_automotive_module_crossfleet(module: str):
    cache_key = f"crossfleet-{module}"
    cached = _cached_response(cache_key, ttl=90.0)
    if cached is not None:
        return cached
    if module not in _VEHICLE_MODULES:
        raise HTTPException(status_code=400, detail="Invalid module")

    specs = _KEY_SENSOR_SPECS.get(module, {})
    sensor_keys = list(specs.keys())
    vehicle_stats: list = []

    for vid, grp in _iter_bronze_by_vehicle(module, columns=sensor_keys):
        stat: dict = {"vehicle_id": vid}
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

    result = {"module": module, "vehicles": vehicle_stats, "sensor_keys": sensor_keys}
    _set_cache(cache_key, result)
    return result


_GOLD_ALERTS_DIR = os.path.join(_PROJECT_ROOT, "data", "delta", "gold", "alerts")
_DTC_HISTORY_FILE = os.path.join(_PROJECT_ROOT, "data", "dtc_history.json")


@router.get("/api/automotive/alerts/{vehicle_id}")
def get_vehicle_alerts(vehicle_id: str):
    live = _get_live(f"alerts-{vehicle_id}")
    if live is not None:
        return live
    import pandas as pd
    if vehicle_id in _HISTORICAL_IDS:
        _bf = os.path.join(_BATCH_ALERTS_ROOT, f"{vehicle_id}.parquet")
        vehicle_df = pd.read_parquet(_bf) if os.path.exists(_bf) else pd.DataFrame()
    else:
        if not os.path.exists(_GOLD_ALERTS_DIR):
            return {"vehicle_id": vehicle_id, "open": [], "closed": []}
        vehicle_df = _query_vehicle_df(_GOLD_ALERTS_DIR, vehicle_id, max_files=100)
    if vehicle_df.empty:
        return {"vehicle_id": vehicle_id, "open": [], "closed": []}
    # Alerts is upsert-style (same alert_id rewritten on every status
    # transition); compaction dedups periodically, but reads must also dedup
    # for whatever's accumulated in the not-yet-compacted recent files.
    if "alert_id" in vehicle_df.columns and "last_updated_ts" in vehicle_df.columns:
        vehicle_df = (
            vehicle_df.sort_values("last_updated_ts")
            .drop_duplicates(subset=["alert_id"], keep="last")
        )
    for col in vehicle_df.select_dtypes(include=["datetime64[ns]", "datetime64[ns, UTC]"]).columns:
        vehicle_df[col] = vehicle_df[col].astype(str)
    # Compacted vs not-yet-compacted alert files can briefly disagree on a
    # column's inferred type (e.g. max_composite_score as float64 in one file,
    # int-like in another) — DuckDB's union_by_name resolves that per-query,
    # which can leave a numeric column as a nullable Int dtype. A blanket
    # fillna("") then throws TypeError on that column (confirmed live: a
    # single request failed with "Invalid value '' for dtype 'Int32'"), so
    # fill object/string columns with "" and numeric columns with 0 separately.
    obj_cols = vehicle_df.select_dtypes(include=["object"]).columns
    vehicle_df[obj_cols] = vehicle_df[obj_cols].fillna("")
    num_cols = vehicle_df.select_dtypes(include=["number"]).columns
    vehicle_df[num_cols] = vehicle_df[num_cols].fillna(0)
    open_df = vehicle_df[vehicle_df["status"] == "OPEN"].sort_values("peak_anomaly_ts", ascending=False)
    closed_df = vehicle_df[vehicle_df["status"] == "CLOSED"].sort_values("alert_end_ts", ascending=False)
    return {
        "vehicle_id": vehicle_id,
        "open": open_df.head(50).to_dict(orient="records"),
        "closed": closed_df.head(50).to_dict(orient="records"),
    }


@router.get("/api/automotive/dtc-history/{vehicle_id}")
def get_vehicle_dtc_history(vehicle_id: str):
    if not os.path.exists(_DTC_HISTORY_FILE):
        return {"vehicle_id": vehicle_id, "runs": []}
    try:
        with open(_DTC_HISTORY_FILE, "r") as f:
            all_runs: list = json.load(f)
    except Exception:
        return {"vehicle_id": vehicle_id, "runs": []}
    vehicle_runs = [r for r in all_runs if r.get("source_id") == vehicle_id]
    vehicle_runs.sort(key=lambda r: r.get("run_ts", ""), reverse=True)
    return {"vehicle_id": vehicle_id, "runs": vehicle_runs[:50]}


_KPI_SENSORS: dict = {
    "engine": [
        ("engine_rpm_rpm",                    "Engine RPM",   "RPM"),
        ("engine_oil_temperature",            "Oil Temp",     "°C"),
        ("ecu_7ea_engine_coolant_temperature","Coolant Temp", "°C"),
        ("engine_load_absolute",              "Engine Load",  "%"),
    ],
    "battery": [
        ("battery_state_of_charge_soc_pct",  "State of Charge", "%"),
        ("battery_state_of_health_soh_pct",  "State of Health", "%"),
        ("battery_temperature_cell",          "Cell Temp",       "°C"),
        ("battery_voltage_ecu_7ee",           "Voltage",         "V"),
    ],
    "body": [
        ("fuel_level_pct",                   "Fuel Level",   "%"),
        ("cabin_temperature",                "Cabin Temp",   "°C"),
        ("cabin_humidity_pct",               "Humidity",     "%"),
        ("ac_compressor_load_pct",           "AC Load",      "%"),
    ],
    "transmission": [
        ("transmission_oil_temperature",     "Oil Temp",     "°C"),
        ("vehicle_speed_kmh",                "Speed",        "km/h"),
        ("gear_position_actual",             "Gear",         ""),
        ("torque_converter_slip_speed",      "TC Slip",      "RPM"),
    ],
    "tyre": [
        ("tyre_pressure_fl_psi", "FL Pressure", "PSI"),
        ("tyre_pressure_fr_psi", "FR Pressure", "PSI"),
        ("tyre_pressure_rl_psi", "RL Pressure", "PSI"),
        ("tyre_pressure_rr_psi", "RR Pressure", "PSI"),
        ("tyre_wear_fl_pct",     "FL Wear",     "%"),
        ("tyre_wear_fr_pct",     "FR Wear",     "%"),
        ("tyre_wear_rl_pct",     "RL Wear",     "%"),
        ("tyre_wear_rr_pct",     "RR Wear",     "%"),
        ("tyre_temp_fl_c",       "FL Temp",     "°C"),
        ("tyre_temp_fr_c",       "FR Temp",     "°C"),
    ],
}

_SERVICE_INTERVAL_KM = 15000


@router.get("/api/automotive/fleet-position/{vehicle_id}")
def get_fleet_position(vehicle_id: str):
    cached = _cached_response(f"fleet-pos-{vehicle_id}", ttl=3.0)
    if cached is not None:
        return cached
    try:
        import urllib.request as _urllib_req
        _req = _urllib_req.urlopen(f"http://127.0.0.1:8009/api/fleet/vehicle/{vehicle_id}", timeout=2)
        result = json.loads(_req.read())
    except Exception:
        result = {}
    _set_cache(f"fleet-pos-{vehicle_id}", result)
    return result


@router.get("/api/automotive/vehicle-bronze-stats/{vehicle_id}")
def get_vehicle_bronze_stats(vehicle_id: str):
    import pandas as pd
    cache_key = f"bronze-stats-{vehicle_id}"
    cached = _cached_response(cache_key, ttl=30.0)
    if cached is not None:
        return cached

    module_stats: dict = {}
    total_rows = 0
    latest_ts: str | None = None

    for mod in _VEHICLE_MODULES:
        partition_path = os.path.join(_DELTA_ROOT, mod, f"source_id={vehicle_id}")
        if not os.path.exists(partition_path):
            continue
        pfiles = dr.list_files(partition_path, max_files=20)
        if not pfiles:
            continue
        try:
            cnt_df = dr.query_df("SELECT COUNT(*) AS cnt FROM read_parquet(?)", pfiles)
            if not cnt_df.empty and "cnt" in cnt_df.columns:
                cnt = int(cnt_df.iloc[0]["cnt"] or 0)
            else:
                cnt = len(cnt_df)
            if cnt > 0:
                module_stats[mod] = cnt
                total_rows += cnt
        except Exception:
            continue
        try:
            ts_df = dr.query_df("SELECT MAX(timestamp) AS max_ts FROM read_parquet(?)", pfiles)
            if not ts_df.empty and "max_ts" in ts_df.columns:
                ts_raw = ts_df.iloc[0].get("max_ts")
                ts_str = str(ts_raw)[:19] if ts_raw is not None and str(ts_raw) not in ("None", "NaT") else None
                if ts_str and (latest_ts is None or ts_str > latest_ts):
                    latest_ts = ts_str
        except Exception:
            pass

    result = {
        "vehicle_id": vehicle_id,
        "total_rows": total_rows,
        "active_modules": list(module_stats.keys()),
        "module_row_counts": module_stats,
        "latest_timestamp": latest_ts,
        "source": "bronze_delta",
    }
    _set_cache(cache_key, result)
    return result


@router.get("/api/automotive/vehicle-summary/{vehicle_id}")
def get_vehicle_summary(vehicle_id: str):
    cache_key = f"vehicle-summary-{vehicle_id}"
    cached = _cached_response(cache_key, ttl=10.0)
    if cached is not None:
        return cached

    import pandas as pd

    # ── 1. Health snapshot from live cache ────────────────────────────────────
    health_snapshot: dict = {
        "health_score": None,
        "status": "UNKNOWN",
        "fleet_rank": None,
        "fleet_total": None,
        "module_contribs": {},
    }
    fleet_live = _get_live("fleet-summary")
    if fleet_live:
        vehicles = fleet_live.get("vehicles", [])
        vehicle_entry = next((v for v in vehicles if v.get("vehicle_id") == vehicle_id), None)
        if vehicle_entry:
            h = vehicle_entry.get("health_score", 0)
            health_snapshot = {
                "health_score": h,
                "status": vehicle_entry.get("status", "UNKNOWN"),
                "fleet_rank": None,
                "fleet_total": len(vehicles),
                "module_contribs": {mod: vehicle_entry.get(f"{mod}_contrib") for mod in _VEHICLE_MODULES},
            }
            sorted_vehicles = sorted(vehicles, key=lambda v: v.get("health_score", 0), reverse=True)
            for rank, v in enumerate(sorted_vehicles, 1):
                if v.get("vehicle_id") == vehicle_id:
                    health_snapshot["fleet_rank"] = rank
                    break

    # ── 2. KPI snapshot (latest bronze sensor values per module) ──────────────
    kpi_snapshot: dict = {}
    for mod in _VEHICLE_MODULES:
        sensors = _KPI_SENSORS.get(mod, [])
        kpi_snapshot[mod] = {"sensors": []}
        partition_path = os.path.join(_DELTA_ROOT, mod, f"source_id={vehicle_id}")
        sensor_vals: dict = {}
        if os.path.exists(partition_path):
            pfiles = dr.list_files(partition_path, max_files=5)
            if pfiles:
                col_list = list(dict.fromkeys([s[0] for s in sensors] + ["timestamp"]))
                col_sql = ", ".join(f'"{c}"' for c in col_list)
                try:
                    df = dr.query_df(f"SELECT {col_sql} FROM read_parquet(?)", pfiles)
                    if not df.empty:
                        if "timestamp" in df.columns:
                            df = df.sort_values("timestamp")
                        last_row = df.iloc[-1]
                        for skey, _, _ in sensors:
                            if skey in df.columns:
                                raw = last_row[skey]
                                try:
                                    sensor_vals[skey] = round(float(raw), 2) if raw is not None and str(raw) != "nan" else None
                                except Exception:
                                    sensor_vals[skey] = None
                except Exception:
                    pass
        for skey, slabel, sunit in sensors:
            spec = _KEY_SENSOR_SPECS.get(mod, {}).get(skey)
            lo, hi = (spec[0], spec[1]) if spec else (None, None)
            kpi_snapshot[mod]["sensors"].append({
                "key": skey,
                "label": slabel,
                "unit": sunit,
                "value": sensor_vals.get(skey),
                "range_lo": lo,
                "range_hi": hi,
            })

    # ── 2b. Tyre RL/RR temp — derived from FL/FR (rear axle runs hotter) ────────
    _tyre_sensors = kpi_snapshot.get("tyre", {}).get("sensors", [])
    _tyre_vals    = {s["key"]: s["value"] for s in _tyre_sensors}
    _tyre_specs   = _KEY_SENSOR_SPECS.get("tyre", {})
    for _dk, _lbl, _src, _offset in [
        ("tyre_temp_rl_c", "RL Temp", "tyre_temp_fl_c", 6.3),
        ("tyre_temp_rr_c", "RR Temp", "tyre_temp_fr_c", 5.8),
    ]:
        _sv   = _tyre_vals.get(_src)
        _spec = _tyre_specs.get(_dk)
        _tyre_sensors.append({
            "key":      _dk,
            "label":    _lbl,
            "unit":     "°C",
            "value":    round(_sv + _offset, 2) if _sv is not None else None,
            "range_lo": _spec[0] if _spec else None,
            "range_hi": _spec[1] if _spec else None,
        })

    # ── 3. Service info (odometer from body bronze) ───────────────────────────
    odometer_km: float | None = None
    body_partition = os.path.join(_DELTA_ROOT, "body", f"source_id={vehicle_id}")
    if os.path.exists(body_partition):
        bfiles = dr.list_files(body_partition, max_files=5)
        if bfiles:
            try:
                bdf = dr.query_df('SELECT "odometer_reading", "timestamp" FROM read_parquet(?)', bfiles)
                if not bdf.empty and "odometer_reading" in bdf.columns:
                    if "timestamp" in bdf.columns:
                        bdf = bdf.sort_values("timestamp")
                    raw_odo = bdf["odometer_reading"].iloc[-1]
                    if raw_odo is not None and str(raw_odo) != "nan":
                        odometer_km = round(float(raw_odo), 1)
            except Exception:
                pass

    next_service_in_km: float | None = None
    if odometer_km is not None:
        next_service_in_km = round(_SERVICE_INTERVAL_KM - (odometer_km % _SERVICE_INTERVAL_KM), 1)

    service_info = {
        "odometer_km": odometer_km,
        "next_service_in_km": next_service_in_km,
        "service_interval_km": _SERVICE_INTERVAL_KM,
    }

    # ── 4. Top anomaly drivers (cross-module, per-vehicle silver top_features) ─
    feature_scores: dict = {}
    feature_modules: dict = {}
    for mod in _VEHICLE_MODULES:
        silver_path = os.path.join(_SILVER_ROOT, mod)
        if not os.path.exists(silver_path):
            continue
        try:
            combined = _query_vehicle_df(silver_path, vehicle_id, _SILVER_MAX_FILES)
            if combined.empty or "top_features" not in combined.columns:
                continue
            for raw in combined["top_features"].dropna():
                try:
                    feats = json.loads(str(raw))
                    for f, v in feats.items():
                        if f == "odometer_reading":
                            continue
                        feature_scores[f] = feature_scores.get(f, 0.0) + abs(float(v))
                        if f not in feature_modules:
                            feature_modules[f] = mod
                except Exception:
                    pass
        except Exception:
            pass

    top_anomaly_drivers = sorted(
        [{"feature": f, "score": round(s, 4), "module": feature_modules.get(f, "")} for f, s in feature_scores.items()],
        key=lambda x: x["score"],
        reverse=True,
    )[:5]

    # ── 5. Last DTC run for this vehicle ──────────────────────────────────────
    last_dtc = None
    if os.path.exists(_DTC_HISTORY_FILE):
        try:
            with open(_DTC_HISTORY_FILE, "r") as fh:
                all_runs: list = json.load(fh)
            vehicle_runs = [r for r in all_runs if r.get("source_id") == vehicle_id]
            vehicle_runs.sort(key=lambda r: r.get("run_ts", ""), reverse=True)
            if vehicle_runs:
                last_dtc = vehicle_runs[0]
        except Exception:
            pass

    # ── 6. Alerts summary from live cache ────────────────────────────────────
    alerts_live = _get_live(f"alerts-{vehicle_id}")
    open_alerts: list = alerts_live.get("open", []) if alerts_live else []
    closed_alerts: list = alerts_live.get("closed", []) if alerts_live else []
    alerts_summary = {
        "open_count": len(open_alerts),
        "closed_count": len(closed_alerts),
        "recent_open": open_alerts[:8],
    }

    # ── 7. Fleet sim data (optional — returns empty dict if simulator offline) ─
    fleet_sim: dict = {}
    trip_data: dict = {}
    try:
        import urllib.request as _urllib_req
        _req = _urllib_req.urlopen(f"http://127.0.0.1:8009/api/fleet/vehicle/{vehicle_id}", timeout=2)
        fleet_sim = json.loads(_req.read())
        if fleet_sim.get("status") == "active":
            try:
                _treq = _urllib_req.urlopen(f"http://127.0.0.1:8009/api/fleet/vehicle/{vehicle_id}/trip", timeout=2)
                trip_data = json.loads(_treq.read())
            except Exception:
                pass
    except Exception:
        pass

    result = {
        "vehicle_id": vehicle_id,
        "health_snapshot": health_snapshot,
        "kpi_snapshot": kpi_snapshot,
        "service_info": service_info,
        "top_anomaly_drivers": top_anomaly_drivers,
        "last_dtc": last_dtc,
        "alerts_summary": alerts_summary,
        "fleet_sim": fleet_sim,
        "trip_data": trip_data,
    }
    _set_cache(cache_key, result)
    return result


_DTC_MASTER_FILE = os.path.join(_PROJECT_ROOT, "contracts", "DTC_master.json")


@router.get("/api/automotive/module-fleet-ranking/{module}")
def get_module_fleet_ranking(module: str):
    cache_key = f"fleet-ranking-{module}"
    cached = _cached_response(cache_key, ttl=60.0)
    if cached is not None:
        return cached
    import pandas as pd
    import numpy as np
    if module not in _VEHICLE_MODULES:
        raise HTTPException(status_code=400, detail="Invalid module")

    vehicle_data: dict = {}
    silver_path = os.path.join(_SILVER_ROOT, module)
    if os.path.exists(silver_path):
        pfiles = dr.list_files(silver_path, max_files=_SILVER_MAX_FILES)
        combined = dr.query_df(
            "SELECT source_id, health_score FROM read_parquet(?)", pfiles,
        ) if pfiles else pd.DataFrame()
        if not combined.empty:
            for vid, grp in combined.groupby("source_id"):
                vehicle_data[str(vid)] = grp["health_score"].dropna().tolist()

    if not vehicle_data and _PRESENTATION_MODE_ACTIVE and _DEMO_SILVER_CACHE:
        for vid in _DEMO_VEHICLES:
            if vid in _DEMO_SILVER_CACHE and module in _DEMO_SILVER_CACHE[vid]:
                vehicle_data[vid] = [r["health_score"] for r in _DEMO_SILVER_CACHE[vid][module]]

    alert_counts: dict = {}
    if os.path.exists(_GOLD_ALERTS_DIR):
        afiles = dr.list_files(_GOLD_ALERTS_DIR, max_files=100)
        adf = dr.query_df("SELECT source_id, alert_id FROM read_parquet(?)", afiles) if afiles else pd.DataFrame()
        if not adf.empty and "source_id" in adf.columns:
            if "alert_id" in adf.columns:
                adf = adf.drop_duplicates(subset=["alert_id"])
            for vid, cnt in adf.groupby("source_id").size().items():
                alert_counts[str(vid)] = int(cnt)

    rankings = []
    for vid, scores in vehicle_data.items():
        if not scores:
            continue
        arr = np.array(scores, dtype=float).clip(0.0, 100.0)
        last50 = arr[-50:] if len(arr) >= 50 else arr
        slope = float(np.polyfit(np.arange(len(last50)), last50, 1)[0]) if len(last50) > 1 else 0.0
        rankings.append({
            "vehicle_id": vid,
            "avg_health": round(float(np.mean(arr)), 1),
            "min_health": round(float(np.min(arr)), 1),
            "trend_slope": round(slope, 4),
            "total_pts": len(scores),
            "alert_count": alert_counts.get(vid, 0),
        })
    rankings.sort(key=lambda x: x["avg_health"], reverse=True)
    result = {"module": module, "rankings": rankings}
    _set_cache(cache_key, result)
    return result


def _compute_module_fleet_health(module: str) -> dict:
    """Pure computation — reads Silver, builds per-vehicle health timeseries.
    Separated from the endpoint so the precompute loop can call it directly
    and cache the result in _LIVE_CACHE for instant endpoint responses."""
    import pandas as pd
    vehicle_pts: dict = {}
    silver_path = os.path.join(_SILVER_ROOT, module)
    if os.path.exists(silver_path):
        pfiles = dr.list_files(silver_path, max_files=_SILVER_MAX_FILES)
        combined = dr.query_df(
            "SELECT source_id, inference_ts, ingest_ts, timestamp, health_score FROM read_parquet(?)", pfiles,
        ) if pfiles else pd.DataFrame()
        if not combined.empty and "source_id" in combined.columns and "health_score" in combined.columns:
            ts_col = next((c for c in ("inference_ts", "ingest_ts", "timestamp") if c in combined.columns), None)
            if ts_col:
                combined["_ts"] = pd.to_datetime(combined[ts_col], errors="coerce")
                combined = combined.sort_values("_ts")
                combined["ts"] = combined["_ts"].dt.strftime("%Y-%m-%d %H:%M:%S.%f").str[:-3]
            else:
                combined["ts"] = combined.index.astype(str)
            for vid, grp in combined.groupby("source_id"):
                pts = grp[["ts", "health_score"]].dropna()
                vehicle_pts[str(vid)] = [
                    {"ts": r["ts"], "v": round(float(r["health_score"]), 1)}
                    for _, r in pts.iterrows()
                ]
    if not vehicle_pts and _PRESENTATION_MODE_ACTIVE and _DEMO_SILVER_CACHE:
        for vid in _DEMO_VEHICLES:
            if vid in _DEMO_SILVER_CACHE and module in _DEMO_SILVER_CACHE[vid]:
                rows = _DEMO_SILVER_CACHE[vid][module]
                factor = max(1, len(rows) // 200)
                vehicle_pts[vid] = [{"ts": r["timestamp"][5:16], "v": r["health_score"]} for r in rows[::factor]]
    all_vids = list(vehicle_pts.keys())
    if not all_vids:
        return {"module": module, "vehicles": [], "series": []}
    vid_map: dict = {vid: {pt["ts"]: pt["v"] for pt in pts} for vid, pts in vehicle_pts.items()}
    all_ts = sorted({pt["ts"] for pts in vehicle_pts.values() for pt in pts})
    result_rows = []
    for ts in all_ts:
        row: dict = {"ts": ts}
        scores = []
        for vid in all_vids:
            v = vid_map[vid].get(ts)
            if v is not None:
                row[vid] = v
                scores.append(v)
        if scores:
            row["fleet_avg"] = round(sum(scores) / len(scores), 1)
        result_rows.append(row)
    return {"module": module, "vehicles": all_vids, "series": result_rows}


def _precompute_module_fleet_health(module: str) -> None:
    """Called by the live loop — computes and stores in LIVE_CACHE."""
    try:
        result = _compute_module_fleet_health(module)
        _set_live(f"module-fleet-health-{module}", result)
    except Exception:
        pass


@router.get("/api/automotive/module-fleet-health/{module}")
def get_module_fleet_health(module: str):
    # Live cache populated by background loop every LIVE_CACHE_INTERVAL_SEC.
    live = _get_live(f"module-fleet-health-{module}")
    if live is not None:
        return live
    cached = _cached_response(f"fleet-health-{module}", ttl=3.0)
    if cached is not None:
        return cached
    if module not in _VEHICLE_MODULES:
        raise HTTPException(status_code=400, detail="Invalid module")
    result = _compute_module_fleet_health(module)
    _set_cache(f"fleet-health-{module}", result)
    return result


@router.get("/api/automotive/module-sensor-stats/{module}")
def get_module_sensor_stats(module: str):
    cache_key = f"sensor-stats-{module}"
    cached = _cached_response(cache_key, ttl=90.0)
    if cached is not None:
        return cached
    import numpy as np
    if module not in _VEHICLE_MODULES:
        raise HTTPException(status_code=400, detail="Invalid module")

    specs = _KEY_SENSOR_SPECS.get(module, {})
    sensor_keys = list(specs.keys())
    vehicle_stats = []

    for vid, grp in _iter_bronze_by_vehicle(module, columns=sensor_keys):
        stat: dict = {"vehicle_id": vid}
        for sk in sensor_keys:
            if sk in grp.columns:
                vals = grp[sk].dropna().values.astype(float)
                if len(vals) > 0:
                    stat[f"{sk}_min"] = round(float(np.min(vals)), 3)
                    stat[f"{sk}_p25"] = round(float(np.percentile(vals, 25)), 3)
                    stat[f"{sk}_median"] = round(float(np.median(vals)), 3)
                    stat[f"{sk}_p75"] = round(float(np.percentile(vals, 75)), 3)
                    stat[f"{sk}_max"] = round(float(np.max(vals)), 3)
                    stat[f"{sk}_mean"] = round(float(np.mean(vals)), 3)
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
                vals = np.array([r[sk] for r in seed_rows if sk in r and r[sk] is not None], dtype=float)
                if len(vals) > 0:
                    stat[f"{sk}_min"] = round(float(np.min(vals)), 3)
                    stat[f"{sk}_p25"] = round(float(np.percentile(vals, 25)), 3)
                    stat[f"{sk}_median"] = round(float(np.median(vals)), 3)
                    stat[f"{sk}_p75"] = round(float(np.percentile(vals, 75)), 3)
                    stat[f"{sk}_max"] = round(float(np.max(vals)), 3)
                    stat[f"{sk}_mean"] = round(float(np.mean(vals)), 3)
            vehicle_stats.append(stat)

    result = {"module": module, "vehicles": vehicle_stats, "sensor_keys": sensor_keys}
    _set_cache(cache_key, result)
    return result


@router.get("/api/automotive/module-sensor-fleet-history/{module}/{sensor}")
def get_module_sensor_fleet_history(module: str, sensor: str):
    cache_key = f"sensor-fleet-history-{module}-{sensor}"
    cached = _cached_response(cache_key, ttl=60.0)
    if cached is not None:
        return cached
    import pandas as pd
    if module not in _VEHICLE_MODULES:
        raise HTTPException(status_code=400, detail="Invalid module")

    vehicle_pts: dict = {}
    for vid, grp in _iter_bronze_by_vehicle(module):
        if sensor not in grp.columns:
            continue
        ts_col = next((c for c in ("timestamp", "ingest_ts") if c in grp.columns), None)
        if not ts_col:
            continue
        grp = grp[[ts_col, sensor]].copy()
        grp["_ts"] = pd.to_datetime(grp[ts_col], errors="coerce")
        grp = grp.dropna(subset=["_ts", sensor]).sort_values("_ts")
        if grp.empty:
            continue
        factor = max(1, len(grp) // 200)
        grp = grp.iloc[::factor].copy()
        grp["ts"] = grp["_ts"].dt.strftime("%Y-%m-%d %H:%M:%S.%f").str[:-3]
        vehicle_pts[vid] = [{"ts": r["ts"], "v": round(float(r[sensor]), 3)} for _, r in grp.iterrows()]

    if not vehicle_pts and _PRESENTATION_MODE_ACTIVE and _DEMO_SEED_CACHE:
        for vid in _DEMO_VEHICLES:
            if vid not in _DEMO_SEED_CACHE or module not in _DEMO_SEED_CACHE[vid]:
                continue
            rows = _DEMO_SEED_CACHE[vid][module]
            factor = max(1, len(rows) // 200)
            pts = [{"ts": r["timestamp"][5:16], "v": r.get(sensor, 0)} for r in rows[::factor] if sensor in r]
            if pts:
                vehicle_pts[vid] = pts

    all_vids = list(vehicle_pts.keys())
    if not all_vids:
        return {"module": module, "sensor": sensor, "vehicles": [], "series": []}

    vid_map: dict = {vid: {pt["ts"]: pt["v"] for pt in pts} for vid, pts in vehicle_pts.items()}
    all_ts = sorted({pt["ts"] for pts in vehicle_pts.values() for pt in pts})

    result_rows = []
    for ts in all_ts:
        row: dict = {"ts": ts}
        for vid in all_vids:
            v = vid_map[vid].get(ts)
            if v is not None:
                row[vid] = v
        result_rows.append(row)

    result = {"module": module, "sensor": sensor, "vehicles": all_vids, "series": result_rows}
    _set_cache(cache_key, result)
    return result


@router.get("/api/automotive/module-top-features/{module}")
def get_module_top_features(module: str):
    cache_key = f"top-features-{module}"
    cached = _cached_response(cache_key, ttl=90.0)
    if cached is not None:
        return cached
    import pandas as pd
    if module not in _VEHICLE_MODULES:
        raise HTTPException(status_code=400, detail="Invalid module")

    feature_totals: dict = {}
    feature_counts: dict = {}

    silver_path = os.path.join(_SILVER_ROOT, module)
    if os.path.exists(silver_path):
        pfiles = dr.list_files(silver_path, max_files=_SILVER_MAX_FILES)
        combined = dr.query_df(
            "SELECT top_features FROM read_parquet(?) WHERE top_features IS NOT NULL", pfiles,
        ) if pfiles else pd.DataFrame()
        if not combined.empty:
            for raw in combined["top_features"].dropna():
                try:
                    feats = json.loads(str(raw))
                    for f, v in feats.items():
                        feature_totals[f] = feature_totals.get(f, 0.0) + float(v)
                        feature_counts[f] = feature_counts.get(f, 0) + 1
                except Exception:
                    pass

    if not feature_totals and _PRESENTATION_MODE_ACTIVE and _DEMO_SILVER_CACHE:
        for vid in _DEMO_VEHICLES:
            if vid not in _DEMO_SILVER_CACHE or module not in _DEMO_SILVER_CACHE[vid]:
                continue
            for row in _DEMO_SILVER_CACHE[vid][module]:
                try:
                    feats = json.loads(str(row.get("top_features", "{}")))
                    for f, v in feats.items():
                        feature_totals[f] = feature_totals.get(f, 0.0) + float(v)
                        feature_counts[f] = feature_counts.get(f, 0) + 1
                except Exception:
                    pass

    features = []
    for f, total in feature_totals.items():
        count = feature_counts.get(f, 1)
        features.append({
            "feature": f,
            "total_score": round(total, 4),
            "avg_score": round(total / count, 4),
            "occurrence_count": count,
        })
    features.sort(key=lambda x: x["total_score"], reverse=True)
    result = {"module": module, "features": features[:20]}
    _set_cache(cache_key, result)
    return result


@router.get("/api/automotive/dtc-sensor-evidence/{vehicle}/{module}/{sensor}")
def get_dtc_sensor_evidence(vehicle: str, module: str, sensor: str, around_ts: str = "", window: int = 60):
    import pandas as pd
    if module not in _VEHICLE_MODULES:
        raise HTTPException(status_code=400, detail="Invalid module")

    cache_key = f"dtc-evidence-{vehicle}-{module}-{sensor}-{around_ts}-{window}"
    cached = _cached_response(cache_key, ttl=30.0)
    if cached is not None:
        return cached

    rows: list = []
    data_source = "none"

    partition_path = os.path.join(_DELTA_ROOT, module, f"source_id={vehicle}")
    if os.path.exists(partition_path):
        pfiles = dr.list_files(partition_path, max_files=20)
        combined = dr.query_df(
            f'SELECT timestamp, ingest_ts, "{sensor}" FROM read_parquet(?)', pfiles,
        ) if pfiles else pd.DataFrame()
        if not combined.empty and sensor in combined.columns:
            ts_col = next((c for c in ("timestamp", "ingest_ts") if c in combined.columns), None)
            if ts_col:
                combined["_ts"] = pd.to_datetime(combined[ts_col], errors="coerce")
                if combined["_ts"].dt.tz is not None:
                    combined["_ts"] = combined["_ts"].dt.tz_localize(None)
                if around_ts:
                    try:
                        center = pd.to_datetime(around_ts)
                        half = pd.Timedelta(minutes=window // 2)
                        combined = combined[
                            (combined["_ts"] >= center - half) & (combined["_ts"] <= center + half)
                        ]
                    except Exception:
                        pass
                combined = combined.sort_values("_ts")
                combined["ts"] = combined["_ts"].dt.strftime("%Y-%m-%d %H:%M:%S.%f").str[:-3]
                out = combined[["ts", sensor]].dropna()
                rows = [{"ts": r["ts"], "value": round(float(r[sensor]), 3)} for _, r in out.iterrows()]
                data_source = "live"

    if not rows and _PRESENTATION_MODE_ACTIVE and vehicle in _DEMO_SEED_CACHE:
        demo = _DEMO_SEED_CACHE[vehicle].get(module, [])
        rows = [{"ts": r["timestamp"][5:16], "value": r.get(sensor, 0)} for r in demo[-200:] if sensor in r]
        data_source = "demo"

    result = {
        "vehicle": vehicle, "module": module, "sensor": sensor,
        "data": rows, "data_source": data_source,
        "around_ts": around_ts, "window_minutes": window,
    }
    _set_cache(cache_key, result)
    return result


@router.get("/api/automotive/dtc/fleet-distribution")
def get_dtc_fleet_distribution():
    if not os.path.exists(_DTC_HISTORY_FILE):
        return {"distribution": []}
    try:
        with open(_DTC_HISTORY_FILE, "r") as fh:
            all_runs: list = json.load(fh)
    except Exception:
        return {"distribution": []}

    code_map: dict = {}
    for run in all_runs:
        for trigger in run.get("triggers", []):
            code = trigger.get("code", "UNKNOWN")
            sev = trigger.get("severity", "WARNING")
            if code not in code_map:
                code_map[code] = {"code": code, "severity": sev, "count": 0, "vehicles": set()}
            code_map[code]["count"] += 1
            code_map[code]["vehicles"].add(run.get("source_id", ""))

    distribution = [
        {"code": v["code"], "severity": v["severity"], "count": v["count"], "vehicle_count": len(v["vehicles"])}
        for v in code_map.values()
    ]
    distribution.sort(key=lambda x: x["count"], reverse=True)
    return {"distribution": distribution[:30]}


@router.get("/api/automotive/dtc/history")
def get_dtc_all_history():
    if not os.path.exists(_DTC_HISTORY_FILE):
        return {"runs": []}
    try:
        with open(_DTC_HISTORY_FILE, "r") as fh:
            all_runs: list = json.load(fh)
    except Exception:
        return {"runs": []}
    all_runs.sort(key=lambda r: r.get("run_ts", ""), reverse=True)
    return {"runs": all_runs[:100]}


@router.get("/api/automotive/dtc-master")
def get_dtc_master_data():
    try:
        with open(_DTC_MASTER_FILE, "r") as fh:
            return json.load(fh)
    except Exception:
        return {"modules": {}}


# ---------------------------------------------------------------------------
# Background precompute loop
# Runs every LIVE_CACHE_INTERVAL_SEC, reads Gold + Alerts ONCE per cycle,
# precomputes all fleet-summary, per-vehicle health histories, and per-vehicle
# alerts. Endpoints below serve from _LIVE_CACHE — always sub-ms, always fresh.
# Mirrors exactly how WRITER_METRICS_CACHE / GOLD_METRICS_CACHE work.
# ---------------------------------------------------------------------------

def _sync_refresh_automotive_cache() -> None:
    import pandas as pd
    try:
        # ── Gold: read once, shared across all vehicle computations ──────────
        gold_df = pd.DataFrame()
        if os.path.exists(_GOLD_ROOT):
            gfiles = dr.list_files(_GOLD_ROOT, max_files=_GOLD_MAX_FILES)
            if gfiles:
                gold_df = dr.query_df("SELECT * FROM read_parquet(?)", gfiles)
                if not gold_df.empty and "gold_window_ts" in gold_df.columns:
                    gold_df["gold_window_ts"] = pd.to_datetime(gold_df["gold_window_ts"])
                    sort_col = "gold_write_ts" if "gold_write_ts" in gold_df.columns else "gold_window_ts"
                    gold_df = (
                        gold_df.sort_values(sort_col)
                        .drop_duplicates(subset=["source_id", "gold_window_ts"], keep="last")
                    )

        # ── Fleet summary ─────────────────────────────────────────────────────
        vehicles_out: list = []
        if not gold_df.empty and "source_id" in gold_df.columns:
            sort_cols = ["gold_window_ts"]
            if "gold_write_ts" in gold_df.columns:
                sort_cols.append("gold_write_ts")
            latest = gold_df.sort_values(sort_cols).groupby("source_id").last().reset_index()
            for _, row in latest.iterrows():
                h = float(row.get("vehicle_health_score", 0))
                for col in latest.select_dtypes(include=["datetime64[ns]", "datetime64[ns, UTC]"]).columns:
                    pass
                vehicles_out.append({
                    "vehicle_id": str(row.get("source_id", "")),
                    "health_score": round(h, 1),
                    "status": "CRITICAL" if h < 60 else ("WARNING" if h < 80 else "OK"),
                    "engine_contrib": round(float(row.get("engine_contrib", 0)), 1),
                    "battery_contrib": round(float(row.get("battery_contrib", 0)), 1),
                    "body_contrib": round(float(row.get("body_contrib", 0)), 1),
                    "transmission_contrib": round(float(row.get("transmission_contrib", 0)), 1),
                    "tyre_contrib": round(float(row.get("tyre_contrib", 0)), 1),
                })
        health_scores = [v["health_score"] for v in vehicles_out]
        fleet_summary = {
            "vehicles": vehicles_out,
            "fleet_stats": {
                "total_vehicles": len(vehicles_out),
                "avg_health": round(sum(health_scores) / max(len(health_scores), 1), 1),
                "critical_count": sum(1 for h in health_scores if h < 60),
                "warning_count": sum(1 for h in health_scores if 60 <= h < 80),
                "demo_active": _PRESENTATION_MODE_ACTIVE,
            },
        }
        _set_live("fleet-summary", fleet_summary)

        # ── Per-vehicle health history ─────────────────────────────────────────
        vehicle_ids = [v["vehicle_id"] for v in vehicles_out]
        for vid in vehicle_ids:
            try:
                if not gold_df.empty and "source_id" in gold_df.columns:
                    vdf = gold_df[gold_df["source_id"] == vid].copy()
                    if not vdf.empty:
                        vdf = vdf.sort_values("gold_window_ts")
                        vdf["ts"] = vdf["gold_window_ts"].dt.strftime("%Y-%m-%d %H:%M:%S.%f")
                        vdf["timestamp"] = vdf["ts"]
                        vdf = _attach_mileage(vdf, vid)
                        vdf = vdf.fillna(0)
                        if "mileage" in vdf.columns:
                            first_m = vdf["mileage"].iloc[0]
                            vdf["mileage_rel"] = (vdf["mileage"] - first_m).round(1)
                        for col in vdf.select_dtypes(include=["datetime64[ns]", "datetime64[ns, UTC]"]).columns:
                            vdf[col] = vdf[col].astype(str)
                        keep = [c for c in ("ts", "vehicle_health_score", "mileage", "mileage_rel") if c in vdf.columns]
                        keep += [c for c in vdf.columns if c.endswith("_contrib")]
                        out = vdf[keep].tail(600).rename(columns={"vehicle_health_score": "health"})
                        _set_live(f"vehicle-health-{vid}", {
                            "data": out.to_dict(orient="records"),
                            "data_source": "live",
                            "vehicle_id": vid,
                            "count": len(out),
                        })
            except Exception:
                pass

        # ── Per-vehicle alerts ────────────────────────────────────────────────
        if os.path.exists(_GOLD_ALERTS_DIR):
            afiles = dr.list_files(_GOLD_ALERTS_DIR, max_files=100)
            if afiles:
                try:
                    adf_all = dr.query_df("SELECT * FROM read_parquet(?)", afiles)
                    if not adf_all.empty and "alert_id" in adf_all.columns and "last_updated_ts" in adf_all.columns:
                        adf_all = (
                            adf_all.sort_values("last_updated_ts")
                            .drop_duplicates(subset=["alert_id"], keep="last")
                        )
                    for vid in vehicle_ids:
                        try:
                            if not adf_all.empty and "source_id" in adf_all.columns:
                                vdf = adf_all[adf_all["source_id"] == vid].copy()
                                obj_cols = vdf.select_dtypes(include=["object"]).columns
                                vdf[obj_cols] = vdf[obj_cols].fillna("")
                                num_cols = vdf.select_dtypes(include=["number"]).columns
                                vdf[num_cols] = vdf[num_cols].fillna(0)
                                for col in vdf.select_dtypes(include=["datetime64[ns]", "datetime64[ns, UTC]"]).columns:
                                    vdf[col] = vdf[col].astype(str)
                                open_df = vdf[vdf["status"] == "OPEN"].sort_values("peak_anomaly_ts", ascending=False)
                                closed_df = vdf[vdf["status"] == "CLOSED"].sort_values("alert_end_ts", ascending=False)
                                _set_live(f"alerts-{vid}", {
                                    "vehicle_id": vid,
                                    "open": open_df.head(50).to_dict(orient="records"),
                                    "closed": closed_df.head(50).to_dict(orient="records"),
                                })
                        except Exception:
                            pass
                except Exception:
                    pass

    except Exception:
        pass


async def automotive_live_loop() -> None:
    global _sse_event_loop
    _sse_event_loop = asyncio.get_event_loop()
    while True:
        # Run main cache refresh + all 5 module fleet-health precomputes
        # concurrently so total cycle time = max(single op), not their sum.
        # Each module read is an independent Silver DuckDB scan that doesn't
        # share state with the others or with the main refresh.
        await asyncio.gather(
            asyncio.to_thread(_sync_refresh_automotive_cache),
            *[asyncio.to_thread(_precompute_module_fleet_health, mod)
              for mod in _VEHICLE_MODULES],
        )
        _compute_and_broadcast_sse_delta()
        await asyncio.sleep(_LIVE_CACHE_INTERVAL_SEC)


def _compute_and_broadcast_sse_delta() -> None:
    """Compute delta (new records since last broadcast) and push to SSE clients.
    Called from the async loop after every precompute cycle. The broadcast is
    tiny — only the new Gold records since the last cycle, typically < 10 rows
    per vehicle per 3-second interval. Clients accumulate in a ring buffer and
    call setOption only when they receive new points, rather than re-fetching
    the full history every poll cycle."""
    if not _sse_clients or not _sse_event_loop:
        return
    with _LIVE_CACHE_LOCK:
        vehicle_keys = [k for k in _LIVE_CACHE if k.startswith("vehicle-health-")]
    delta: dict = {}
    for key in vehicle_keys:
        vid = key[len("vehicle-health-"):]
        cached = _LIVE_CACHE.get(key)
        if not cached:
            continue
        data = cached.get("data", [])
        if not data:
            continue
        last_ts = _sse_last_ts.get(vid, "")
        if last_ts:
            new_pts = [d for d in data if d.get("ts", "") > last_ts]
        else:
            new_pts = data[-30:]
        if new_pts:
            _sse_last_ts[vid] = new_pts[-1].get("ts", "")
            delta[vid] = new_pts
    fleet_summary_cached = _LIVE_CACHE.get("fleet-summary")
    vehicle_streams = fleet_summary_cached.get("vehicles", []) if fleet_summary_cached else []
    if not delta and not vehicle_streams:
        return
    payload = json.dumps({"type": "gold_delta", "vehicles": vehicle_streams, "delta": delta})
    _sse_broadcast(payload)


# ── Historical vehicle read-only endpoints ────────────────────────────────────

@router.get("/api/automotive/vehicle/{vehicle_id}/is-historical")
def check_historical(vehicle_id: str):
    return {"vehicle_id": vehicle_id, "is_historical": vehicle_id in _HISTORICAL_IDS}


@router.get("/api/automotive/vehicle/{vehicle_id}/last-state")
def get_last_state(vehicle_id: str):
    data = _load_historical_layer(vehicle_id, "last_state")
    if data is None:
        raise HTTPException(status_code=404, detail="No computed data for vehicle")
    return data


@router.get("/api/automotive/vehicle/{vehicle_id}/trips")
def get_historical_trips(vehicle_id: str):
    data = _load_historical_layer(vehicle_id, "trips")
    if data is None:
        raise HTTPException(status_code=404, detail="No computed data for vehicle")
    return {"vehicle_id": vehicle_id, "trips": data, "count": len(data)}


@router.get("/api/automotive/vehicle/{vehicle_id}/events")
def get_historical_events(vehicle_id: str, limit: int = Query(default=200, ge=1, le=2000)):
    data = _load_historical_layer(vehicle_id, "events")
    if data is None:
        raise HTTPException(status_code=404, detail="No computed data for vehicle")
    return {"vehicle_id": vehicle_id, "events": data[-limit:], "count": len(data)}


@router.get("/api/automotive/vehicle/{vehicle_id}/dtcs")
def get_historical_dtcs(vehicle_id: str):
    data = _load_historical_layer(vehicle_id, "dtcs")
    if data is None:
        raise HTTPException(status_code=404, detail="No computed data for vehicle")
    return {"vehicle_id": vehicle_id, "dtcs": data, "count": len(data)}


@router.get("/api/automotive/vehicle/{vehicle_id}/alerts")
def get_historical_alerts(vehicle_id: str):
    data = _load_historical_layer(vehicle_id, "alerts")
    if data is None:
        raise HTTPException(status_code=404, detail="No computed data for vehicle")
    return {"vehicle_id": vehicle_id, "alerts": data, "count": len(data)}


@router.get("/api/automotive/vehicle/{vehicle_id}/driver-summary")
def get_driver_summary(vehicle_id: str):
    data = _load_historical_layer(vehicle_id, "driver_summary")
    if data is None:
        raise HTTPException(status_code=404, detail="No computed data for vehicle")
    return data