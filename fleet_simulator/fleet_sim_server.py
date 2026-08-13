import asyncio
import json
import math
import os
from threading import Lock

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from trip_engine import TripEngine
from fleet_config import VEHICLES, get_fleet_summary, get_maintenance_forecast

_ENDPOINT_MATCH_KM = 20.0


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _nearest_route_endpoint_label(
    lat: float, lng: float, route_coords: list, origin_name: str, dest_name: str
) -> str:
    o_lat, o_lng = route_coords[0]
    d_lat, d_lng = route_coords[-1]
    d_to_origin = _haversine_km(lat, lng, o_lat, o_lng)
    d_to_dest = _haversine_km(lat, lng, d_lat, d_lng)
    if d_to_origin <= d_to_dest and d_to_origin <= _ENDPOINT_MATCH_KM:
        return origin_name
    if d_to_dest < d_to_origin and d_to_dest <= _ENDPOINT_MATCH_KM:
        return dest_name
    return f"En route ({origin_name.split(',')[0]} – {dest_name.split(',')[0]})"

app = FastAPI(title="Fleet Simulator", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_region = "india"
engine = TripEngine(region=_region)
_ready = False

_sse_clients: list = []
_sse_clients_lock = Lock()
_sse_event_loop = None


def _sse_broadcast(payload: str) -> None:
    if not _sse_event_loop or not _sse_clients:
        return
    with _sse_clients_lock:
        clients = list(_sse_clients)
    for q in clients:
        _sse_event_loop.call_soon_threadsafe(q.put_nowait, payload)

_DATA_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "data"))


def _computed_root_for(region: str) -> str:
    return os.path.join(_DATA_ROOT, "computed" if region == "india" else "computed_us")


_computed: dict[str, dict] = {}
_hist_cache: dict[str, dict] = {}


def _load_computed(region: str) -> None:
    _computed.clear()
    _hist_cache.clear()
    computed_root = _computed_root_for(region)
    for v in VEHICLES:
        vid = v["id"]
        vdir = os.path.join(computed_root, vid)
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


def _broadcast_behavior_snapshot() -> None:
    if not _sse_clients:
        return
    behavior: dict = {}
    for vid in list(engine.active_vehicles.keys()):
        data = engine.get_behavior_data(vid)
        if data:
            behavior[vid] = data
    if behavior:
        _sse_broadcast(json.dumps({"type": "behavior_delta", "behavior": behavior}))


async def _init_and_run():
    global _ready, _sse_event_loop
    loop = asyncio.get_running_loop()
    _sse_event_loop = loop
    await loop.run_in_executor(None, engine.initialize)
    await loop.run_in_executor(None, _load_computed, _region)
    _ready = True
    while True:
        engine.tick()
        _broadcast_behavior_snapshot()
        await asyncio.sleep(2.0)


@app.on_event("startup")
async def startup():
    asyncio.create_task(_init_and_run())


@app.get("/api/fleet/region")
async def get_region():
    return {"region": _region, "ready": _ready}


@app.post("/api/fleet/region")
async def set_region(payload: dict):
    global engine, _region, _ready
    region = payload.get("region", "india")
    if region not in ("india", "america"):
        raise HTTPException(status_code=400, detail="region must be 'india' or 'america'")
    if region == _region:
        return {"region": _region, "ready": _ready}

    _ready = False
    new_engine = TripEngine(region=region)
    loop = asyncio.get_running_loop()
    # Build the new engine fully off to the side before touching any module
    # state — the background tick loop keeps ticking the OLD engine object
    # harmlessly in the meantime, so nothing is ever served half-initialized.
    await loop.run_in_executor(None, new_engine.initialize)
    await loop.run_in_executor(None, _load_computed, region)
    engine = new_engine
    _region = region
    _ready = True
    return {"region": _region, "ready": _ready}


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
            # fleet_config only ever carries one static parked/in_service
            # position (India) — for non-active vehicles the real position is
            # last_state.json, which precompute_history.py generates per
            # region. Overriding lat/lng/route_name (not just driver_score)
            # is what keeps a parked US vehicle from rendering at its old
            # Indian coordinates, off the visible US map entirely.
            if ls.get("lat") is not None:
                pos["lat"] = ls["lat"]
            if ls.get("lng") is not None:
                pos["lng"] = ls["lng"]
            if ls.get("route_name"):
                pos["route_name"] = ls["route_name"]
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
        route_stem = v_config.get("route_us" if _region == "america" else "route", "")
        if route_stem:
            routes_subdir = "routes_us" if _region == "america" else "routes"
            route_path = os.path.join(
                os.path.dirname(__file__), routes_subdir, f"{route_stem}.json"
            )
            if os.path.exists(route_path):
                with open(route_path, "r", encoding="utf-8") as fh:
                    rd = json.load(fh)
                    route_origin_name = rd.get("origin", "")
                    route_dest_name = rd.get("destination", "")
                    route_coords = rd.get("coordinates", [])
                # A trip's own route_waypoints often cover only part of the
                # full route (repeated shorter journeys, not always
                # end-to-end), so the full route's origin/destination only
                # apply when the trip's own endpoints actually sit near
                # them — otherwise label with whichever named endpoint the
                # trip actually starts/ends closest to, so a short segment
                # near one city isn't stamped with the other end's name too.
                wp = (last_trip or {}).get("route_waypoints") or []
                if wp and route_coords:
                    origin = _nearest_route_endpoint_label(
                        wp[0][0], wp[0][1], route_coords, route_origin_name, route_dest_name
                    )
                    destination = _nearest_route_endpoint_label(
                        wp[-1][0], wp[-1][1], route_coords, route_origin_name, route_dest_name
                    )
                else:
                    origin, destination = route_origin_name, route_dest_name
    if last_trip:
        # last_trip (from trips.json) already carries its own accurate
        # route_waypoints for the actual segment driven on that trip — dict()
        # preserves it untouched; do not overwrite it with the full route's
        # geometry, which would show the entire route instead of just the
        # last trip's path.
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
        # trip_events is already filtered down to just this one trip's
        # events (by trip_id, above) — a long/high-distance trip (e.g. the
        # full end-to-end route) can genuinely have 50+ harsh-driving events,
        # so a flat [-50:] here was silently dropping the oldest ones from
        # the map's event markers. 200 is a generous ceiling well above any
        # observed trip's event count, kept only as a sanity bound.
        "trip_events": trip_events[-200:],
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
            trips = hist.get("trips", [])
            last_trip = trips[-1] if trips else {}
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
                    "braking": last_trip.get("harsh_braking_count", 0),
                    "accel": last_trip.get("harsh_accel_count", 0),
                    "cornering": last_trip.get("harsh_cornering_count", 0),
                    "total": last_trip.get("harsh_braking_count", 0) + last_trip.get("harsh_accel_count", 0) + last_trip.get("harsh_cornering_count", 0),
                },
                "trip_distance_km": last_trip.get("distance_km", total_km),
                "is_historical": True,
            }
    data = engine.get_behavior_data(vehicle_id)
    if not data:
        raise HTTPException(status_code=404, detail="No behavior data for vehicle")
    return data


@app.get("/api/fleet/stream")
async def fleet_sse_stream():
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
        trips = cache.get("trips", [])
        last_trip = trips[-1] if trips else {}
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
                    "braking": last_trip.get("harsh_braking_count", 0),
                    "accel": last_trip.get("harsh_accel_count", 0),
                    "cornering": last_trip.get("harsh_cornering_count", 0),
                    "total": last_trip.get("harsh_braking_count", 0) + last_trip.get("harsh_accel_count", 0) + last_trip.get("harsh_cornering_count", 0),
                },
                "trip_distance_km": last_trip.get("distance_km", total_km),
                "is_historical": True,
            },
            "is_historical": True,
        }
    return {"vehicles": result}


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8009)
