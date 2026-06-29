import asyncio
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from trip_engine import TripEngine
from fleet_config import get_fleet_summary

app = FastAPI(title="Fleet Simulator", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

engine = TripEngine()
_ready = False


async def _init_and_run():
    global _ready
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, engine.initialize)
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
    active_scores = []
    for vid, st in engine.active_vehicles.items():
        active_scores.append(st.behavior.score)
    if active_scores:
        summary["avg_driver_score"] = round(sum(active_scores) / len(active_scores), 1)
    else:
        summary["avg_driver_score"] = 100.0
    return summary


@app.get("/api/fleet/positions")
async def fleet_positions():
    if not _ready:
        return []
    return engine.get_all_positions()


@app.get("/api/fleet/vehicle/{vehicle_id}")
async def vehicle_detail(vehicle_id: str):
    if not _ready:
        raise HTTPException(status_code=503, detail="Initializing")
    data = engine.get_vehicle_detail(vehicle_id)
    if not data:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return data


@app.get("/api/fleet/vehicle/{vehicle_id}/trip")
async def vehicle_trip(vehicle_id: str):
    if not _ready:
        raise HTTPException(status_code=503, detail="Initializing")
    data = engine.get_trip_data(vehicle_id)
    if not data:
        raise HTTPException(status_code=404, detail="No trip data for vehicle")
    return data


@app.get("/api/fleet/vehicle/{vehicle_id}/behavior")
async def vehicle_behavior(vehicle_id: str):
    if not _ready:
        raise HTTPException(status_code=503, detail="Initializing")
    data = engine.get_behavior_data(vehicle_id)
    if not data:
        raise HTTPException(status_code=404, detail="No behavior data for vehicle")
    return data


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8009)
