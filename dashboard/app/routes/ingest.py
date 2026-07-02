from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from dashboard.app.dependencies import get_dashboard_state

router = APIRouter()

@router.get("/ingest")
def ingest(state=Depends(get_dashboard_state)):
    metrics = state.ingest_metrics()

    return JSONResponse(
        content={
            "stage": "ingest",
            "description": "Ingest gateway metrics snapshot",
            "metrics": metrics,
        }
    )