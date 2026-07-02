# dashboard/app/main.py
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pathlib import Path

from dashboard.app.config_loader import DashboardConfig
# Import the global state module to assign the singleton
import dashboard.app.state as global_state
from dashboard.app.state import DashboardState

from dashboard.app.adapters.replay_metrics import fetch_replay_metrics
from dashboard.app.adapters.ingest_metrics import fetch_ingest_metrics
from dashboard.app.adapters.kafka_metrics import fetch_kafka_metrics

# Import routers
from dashboard.app.routes.overview import router as overview_router
from dashboard.app.routes.replay import router as replay_router
from dashboard.app.routes.ingest import router as ingest_router
from dashboard.app.routes.kafka import router as kafka_router
from dashboard.app.routes.vehicles import router as vehicles_router


app = FastAPI(
    title="Telemetry Dashboard",
    version="1.0",
    description="Read-only dashboard for replay, ingest, and Kafka layers",
)


@app.on_event("startup")
def init_dashboard_state() -> None:
    config = DashboardConfig(
        Path("dashboard/config/dashboard_config.json")
    )

    # Initialize the state object
    state = DashboardState(
        replay_fetcher=lambda: fetch_replay_metrics(
            config.replay_metrics_url
        ),
        ingest_fetcher=lambda: fetch_ingest_metrics(
            config.ingest_metrics_url
        ),
        kafka_fetcher=lambda: fetch_kafka_metrics(
            config.kafka_metrics_url
        ),
        ttl_seconds=5,
    )
    
    # Assign it to the global variable in the state module
    global_state.dashboard_state = state


# -------------------------------------------------
# Health
# -------------------------------------------------
@app.get("/health")
def health():
    return {"status": "ok"}


# -------------------------------------------------
# Layer Routers
# -------------------------------------------------
app.include_router(overview_router)
app.include_router(replay_router)
app.include_router(ingest_router)
app.include_router(kafka_router)
app.include_router(vehicles_router)