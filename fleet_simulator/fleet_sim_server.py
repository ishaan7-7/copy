import asyncio
import json
import os

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from trip_engine import TripEngine
from fleet_config import VEHICLES, get_fleet_summary, get_maintenance_forecast

app = FastAPI(title="Fleet Simulator", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

engine = TripEngine()
_ready = False

_COMPUTED_ROOT = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "data", "computed")
)
_computed: dict[str, dict] = {}
_hist_cache: dict[str, dict] = {}


def _load_computed() -> None:
    for v in VEHICLES:
        vid = v["id"]
        vdir = os.path.join(_COMPUTED_ROOT, vid)
        if not os.path.isdir(vdir):
            continue

        trips_data: dict = {}
        for layer in ("trips", "events", "driver_summary"):
            path = os.path.join(vdir, f"{layer}.json")
            if os.path.exists(path):
                with open(path, "r", encoding="utf-8") as fh:
                    trips_data[layer] = json.load(fh)
        if trips_data:
            _hist_cache[vid] = trips_data

        if v["status"] != "active":
            cache: dict = dict(trips_data)
            path = os.path.join(vdir, "last_state.json")
            if os.path.exists(path):
                with open(path, "r", encoding="utf-8") as fh:
                    cache["last_state"] = json.load(fh)
            if cache:
                _computed[vid] = cache


async def _init_and_run():
    global _ready
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, engine.initialize)
    await loop.run_in_executor(None, _load_computed)
    _ready = True
    while True:
        engine.tick()
        await asyncio.sleep(2.0)


@app.on_event("startup")
async def startup():
    asyncio.create_task(_init_and_run())


@app.get("/api/fleet/summary")
async def fleet_summary():
    summary = get_fleet_summary()
    if not _ready:
        summary["avg_driver_score"] = 100.0
        return summary
    scores = [st.behavior.score for st in engine.active_vehicles.values()]
    summary["avg_driver_score"] = round(sum(scores) / len(scores), 1) if scores else 100.0
    return summary


@app.get("/api/fleet/maintenance-forecast")
async def maintenance_forecast():
    return get_maintenance_forecast()


@app.get("/api/fleet/positions")
async def fleet_positions():
    if not _ready:
        return []
    positions = engine.get_all_positions()
    for pos in positions:
        vid = pos["vehicle_id"]
        if vid in _computed:
            ls = _computed[vid].get("last_state", {})
            ds = _computed[vid].get("driver_summary", {})
            pos["driver_score"] = ds.get("score", ls.get("driver_score", 100.0))
    return positions


@app.get("/api/fleet/vehicle/{vehicle_id}")
async def vehicle_detail(vehicle_id: str):
    if not _ready:
        raise HTTPException(status_code=503, detail="Initializing")
    if vehicle_id in _computed:
        ls = _computed[vehicle_id].get("last_state", {})
        ds = _computed[vehicle_id].get("driver_summary", {})
        if ls:
            detail = dict(ls)
            detail["driver_score"] = ds.get("score", detail.get("driver_score", 100.0))
            return detail
    data = engine.get_vehicle_detail(vehicle_id)
    if not data:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return data


@app.get("/api/fleet/vehicle/{vehicle_id}/trip")
async def vehicle_trip(vehicle_id: str):
    if not _ready:
        raise HTTPException(status_code=503, detail="Initializing")
    if vehicle_id in _computed:
        raise HTTPException(status_code=404, detail="Use /last-trip for historical vehicles")
    data = engine.get_trip_data(vehicle_id)
    if not data:
        raise HTTPException(status_code=404, detail="No trip data for vehicle")
    return data


@app.get("/api/fleet/vehicle/{vehicle_id}/last-trip")
async def vehicle_last_trip(vehicle_id: str):
    if not _ready:
        raise HTTPException(status_code=503, detail="Initializing")
    cache = _hist_cache.get(vehicle_id)
    if not cache:
        raise HTTPException(status_code=404, detail="No historical data for vehicle")
    trips = cache.get("trips", [])
    last_trip = trips[-1] if trips else None
    events = cache.get("events", [])
    if last_trip:
        trip_id = last_trip.get("trip_id")
        trip_events = [e for e in events if e.get("trip_id") == trip_id]
    else:
        trip_events = []
    ds = cache.get("driver_summary", {})
    origin, destination = "", ""
    v_config = next((v for v in VEHICLES if v["id"] == vehicle_id), None)
    if v_config:
        route_stem = v_config.get("route", "")
        if route_stem:
            route_path = os.path.join(
                os.path.dirname(__file__), "routes", f"{route_stem}.json"
            )
            if os.path.exists(route_path):
                with open(route_path, "r", encoding="utf-8") as fh:
                    rd = json.load(fh)
                    origin = rd.get("origin", "")
                    destination = rd.get("destination", "")
    if last_trip:
        last_trip = dict(last_trip)
        last_trip["start_time"] = last_trip.pop("start_ts", last_trip.get("start_time", ""))
        last_trip["end_time"] = last_trip.pop("end_ts", last_trip.get("end_time", ""))
        duration_mins = last_trip.pop("duration_mins", None)
        if "duration_secs" not in last_trip and duration_mins is not None:
            last_trip["duration_secs"] = round(duration_mins * 60)
        last_trip["origin"] = origin
        last_trip["destination"] = destination
    return {
        "last_trip": last_trip,
        "trip_events": trip_events[-50:],
        "driver_summary": ds,
        "is_historical": True,
    }


@app.get("/api/fleet/vehicle/{vehicle_id}/behavior")
async def vehicle_behavior(vehicle_id: str):
    if not _ready:
        raise HTTPException(status_code=503, detail="Initializing")
    hist = _hist_cache.get(vehicle_id)
    if hist and vehicle_id not in engine.active_vehicles:
        ds = hist.get("driver_summary", {})
        if ds:
            total_km = ds.get("total_km", 0.0)
            return {
                "current_score": ds.get("score", 100.0),
                "score_timeline": [],
                "traction_circle": [],
                "risk_radar": {
                    "braking_per_100km": round(ds.get("harsh_braking_count", 0) / max(total_km, 0.1) * 100, 1),
                    "accel_per_100km": round(ds.get("harsh_accel_count", 0) / max(total_km, 0.1) * 100, 1),
                    "cornering_per_100km": round(ds.get("harsh_cornering_count", 0) / max(total_km, 0.1) * 100, 1),
                },
                "speed_by_road": {},
                "event_summary": {
                    "braking": ds.get("harsh_braking_count", 0),
                    "accel": ds.get("harsh_accel_count", 0),
                    "cornering": ds.get("harsh_cornering_count", 0),
                    "total": ds.get("harsh_braking_count", 0) + ds.get("harsh_accel_count", 0) + ds.get("harsh_cornering_count", 0),
                },
                "trip_distance_km": total_km,
                "is_historical": True,
            }
    data = engine.get_behavior_data(vehicle_id)
    if not data:
        raise HTTPException(status_code=404, detail="No behavior data for vehicle")
    return data


@app.get("/api/fleet/all")
async def fleet_all():
    """Batch endpoint — returns detail+trip+behavior for every vehicle
    (active: live data; non-active: last_state + driver_summary)."""
    if not _ready:
        return {"vehicles": {}}
    result: dict = {}
    for vid in list(engine.active_vehicles.keys()):
        result[vid] = {
            "detail":   engine.get_vehicle_detail(vid),
            "trip":     engine.get_trip_data(vid),
            "behavior": engine.get_behavior_data(vid),
        }
    for vid, cache in _computed.items():
        ls = cache.get("last_state", {})
        ds = cache.get("driver_summary", {})
        if not ls:
            continue
        detail = dict(ls)
        detail["driver_score"] = ds.get("score", detail.get("driver_score", 100.0))
        total_km = ds.get("total_km", 0.0)
        result[vid] = {
            "detail": detail,
            "trip": None,
            "behavior": {
                "current_score": ds.get("score", 100.0),
                "score_timeline": [],
                "traction_circle": [],
                "risk_radar": {
                    "braking_per_100km": round(ds.get("harsh_braking_count", 0) / max(total_km, 0.1) * 100, 1),
                    "accel_per_100km": round(ds.get("harsh_accel_count", 0) / max(total_km, 0.1) * 100, 1),
                    "cornering_per_100km": round(ds.get("harsh_cornering_count", 0) / max(total_km, 0.1) * 100, 1),
                },
                "speed_by_road": {},
                "event_summary": {
                    "braking": ds.get("harsh_braking_count", 0),
                    "accel": ds.get("harsh_accel_count", 0),
                    "cornering": ds.get("harsh_cornering_count", 0),
                    "total": ds.get("harsh_braking_count", 0) + ds.get("harsh_accel_count", 0) + ds.get("harsh_cornering_count", 0),
                },
                "trip_distance_km": total_km,
                "is_historical": True,
            },
            "is_historical": True,
        }
    return {"vehicles": result}


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8009)
