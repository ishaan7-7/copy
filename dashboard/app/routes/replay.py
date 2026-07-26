from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from dashboard.app.dependencies import get_dashboard_state

router = APIRouter()

@router.get("/replay")
def replay(state=Depends(get_dashboard_state)):
    metrics = state.replay_metrics()

    return JSONResponse(
        content={
            "stage": "replay",
            "description": "Replay service metrics snapshot",
            "metrics": metrics,
        }
    )