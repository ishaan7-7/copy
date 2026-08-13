import asyncio
import json
import logging
import os
import time
import aiohttp
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("API_Gateway")


app = FastAPI(
    title="Master Dashboard API Gateway",
    description="Routes React frontend requests to isolated backend microservices"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", "http://127.0.0.1:5173"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


SERVICES = {
    "writer":    "http://127.0.0.1:8001",
    "inference": "http://127.0.0.1:8002",
    "gold":      "http://127.0.0.1:8003",
    "alerts":    "http://127.0.0.1:8004",
    "observer":  "http://127.0.0.1:8006",
    "dtc":       "http://127.0.0.1:8007",
    "fleet":     "http://127.0.0.1:8009",
}


_http_session: aiohttp.ClientSession | None = None

async def _get_session() -> aiohttp.ClientSession:
    global _http_session
    if _http_session is None or _http_session.closed:
        _http_session = aiohttp.ClientSession(
            timeout=aiohttp.ClientTimeout(total=10),
            connector=aiohttp.TCPConnector(limit=20, keepalive_timeout=30),
        )
    return _http_session

@app.on_event("shutdown")
async def shutdown_session():
    global _http_session
    if _http_session and not _http_session.closed:
        await _http_session.close()


_CB_THRESHOLD  = 3
_CB_OPEN_SEC   = 10.0
_cb: dict = {}

def _cb_state(key: str) -> dict:
    if key not in _cb:
        _cb[key] = {"failures": 0, "open_until": 0.0, "last_ok": None}
    return _cb[key]

def _cb_success(key: str, result) -> None:
    s = _cb_state(key)
    s["failures"] = 0
    s["last_ok"]  = result

def _cb_failure(key: str) -> None:
    s = _cb_state(key)
    s["failures"] += 1
    if s["failures"] >= _CB_THRESHOLD:
        s["open_until"] = time.monotonic() + _CB_OPEN_SEC
        s["failures"]   = 0

def _cb_open(key: str) -> bool:
    return time.monotonic() < _cb_state(key)["open_until"]


async def proxy_request(service_key: str, endpoint: str, request: Request, fallback_data: dict, timeout: int = 8, skip_cb: bool = False):
    base_url = SERVICES.get(service_key)
    if not base_url:
        return JSONResponse(status_code=500, content={"error": "Service routing not configured"})


    if not skip_cb and _cb_open(service_key):
        cached = _cb_state(service_key)["last_ok"]
        return cached if cached is not None else fallback_data

    target_url  = f"{base_url}{endpoint}"
    query_params = dict(request.query_params)

    try:
        session = await _get_session()
        req_timeout = aiohttp.ClientTimeout(total=timeout)
        async with session.get(target_url, params=query_params, timeout=req_timeout) as resp:
            if resp.status == 200:
                result = await resp.json()
                if not skip_cb:
                    _cb_success(service_key, result)
                return result
            else:
                await resp.text()
                if not skip_cb:
                    _cb_failure(service_key)
                cached = _cb_state(service_key)["last_ok"]
                return cached if cached is not None else fallback_data

    except aiohttp.ClientConnectorError:
        if not skip_cb:
            _cb_failure(service_key)
        return fallback_data
    except asyncio.TimeoutError:
        if not skip_cb:
            _cb_failure(service_key)
            cached = _cb_state(service_key)["last_ok"]
            return cached if cached is not None else fallback_data
        return fallback_data
    except Exception as e:
        logger.error(f"Unexpected proxy error for {service_key}: {e}")
        if not skip_cb:
            _cb_failure(service_key)
        cached = _cb_state(service_key)["last_ok"]
        return cached if cached is not None else fallback_data


@app.get("/health")
def health_check():
    return {"status": "Master Gateway V2 is Online", "port": 8005}


@app.get("/api/writer/metrics")
async def get_writer_metrics(request: Request):
    return await proxy_request("writer", "/api/writer/metrics", request, fallback_data={})

@app.get("/api/writer/inspector/{module}")
async def get_writer_inspector(module: str, request: Request):
    return await proxy_request("writer", f"/api/writer/inspector/{module}", request, fallback_data={"data": []}, timeout=60)


@app.get("/api/inference/metrics")
async def get_inference_metrics(request: Request):
    fallback = {
        "active_sims": 0, "active_modules": 0, "global_e2e_ms": 0,
        "global_inf_ms": 0, "module_stats": {}, "recent_alerts": []
    }
    return await proxy_request("inference", "/api/inference/metrics", request, fallback_data=fallback)

@app.get("/api/inference/tail/{module}")
async def get_inference_tail(module: str, request: Request):
    return await proxy_request("inference", f"/api/inference/tail/{module}", request, fallback_data={"data": []}, timeout=60)


@app.get("/api/gold/metrics")
async def get_gold_metrics(request: Request):
    fallback = {"active_sims": [], "total_gold_rows": 0, "processing_lags": {}, "global_max_lag": 0, "fleet_vehicle_health_pct": None}
    return await proxy_request("gold", "/api/gold/metrics", request, fallback_data=fallback)

@app.get("/api/gold/config")
async def get_gold_config(request: Request):
    return await proxy_request("gold", "/api/gold/config", request, fallback_data={})

@app.get("/api/gold/history/{sim_id}")
async def get_gold_history(sim_id: str, request: Request):
    return await proxy_request("gold", f"/api/gold/history/{sim_id}", request, fallback_data={"data": []}, timeout=60)


@app.get("/api/alerts/metrics")
async def get_alerts_metrics(request: Request):
    fallback = {"active_alerts_count": 0, "critical_vehicles": 0, "processing_lag": 0, "open_alerts": [], "closed_alerts": []}
    return await proxy_request("alerts", "/api/alerts/metrics", request, fallback_data=fallback)

@app.get("/api/dtc/analyze")
async def analyze_dtc(request: Request):
    return await proxy_request("dtc", "/api/dtc/analyze", request, fallback_data={"error": "DTC Service Offline"}, timeout=120, skip_cb=True)


@app.get("/api/observer/snapshot")
async def get_observer_snapshot(request: Request):
    fallback = {
        "system_health": {}, 
        "global_stats": {"total_rows": 0, "active_vehicles": 0, "avg_latency": 0.0, "dlq_backlog": 0}, 
        "vehicles": []
    }
    return await proxy_request("observer", "/api/observer/snapshot", request, fallback_data=fallback)


@app.get("/api/fleet/{path:path}")
async def proxy_fleet(path: str, request: Request):
    fallbacks: dict = {
        "summary":   {"vehicles": [], "avg_health": 0, "active_count": 0},
        "positions": [],
    }
    key = path.split("/")[0]
    return await proxy_request("fleet", f"/api/fleet/{path}", request,
                               fallback_data=fallbacks.get(key, {}), timeout=5)


_SESSION_RESET_FILE = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "data", "session_reset_token.json")
)

@app.get("/api/session/reset-token")
async def get_session_reset_token():
    try:
        if os.path.exists(_SESSION_RESET_FILE):
            with open(_SESSION_RESET_FILE, "r", encoding="utf-8") as fh:
                data = json.load(fh)
            return {"reset_token": data.get("reset_token", "none")}
    except Exception:
        pass
    return {"reset_token": "none"}

import sys as _sys, os as _os
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
_automotive_loop_fn = None
try:
    from automotive_api import router as automotive_router, automotive_live_loop as _automotive_loop_fn
    app.include_router(automotive_router)
except Exception as _import_err:
    import logging as _log
    _log.getLogger(__name__).warning(f"Automotive endpoints not loaded: {_import_err}")

@app.on_event("startup")
async def _start_background_tasks():
    if _automotive_loop_fn is not None:
        asyncio.create_task(_automotive_loop_fn())

_FRONTEND_DIST = _os.path.abspath(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "..", "frontend", "dist"))
if _os.path.isdir(_FRONTEND_DIST):
    from fastapi.staticfiles import StaticFiles

    class _SPAStaticFiles(StaticFiles):
        """index.html is the SPA shell — its name never changes across builds,
        so a browser that caches it will keep pointing at a stale (possibly
        deleted) hashed bundle forever. Every other asset Vite emits carries a
        content hash in its filename, so a changed file is always a new URL —
        those are safe to cache for as long as the browser likes."""

        async def get_response(self, path: str, scope):
            response = await super().get_response(path, scope)
            if response.media_type == "text/html":
                response.headers["Cache-Control"] = "no-store"
            else:
                response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
            return response

    app.mount("/", _SPAStaticFiles(directory=_FRONTEND_DIST, html=True), name="frontend")
    logger.info(f"Serving built frontend from {_FRONTEND_DIST} at http://127.0.0.1:8005/")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main_v2:app", host="127.0.0.1", port=8005, reload=True)