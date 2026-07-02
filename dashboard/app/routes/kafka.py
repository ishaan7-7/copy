
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from dashboard.app.dependencies import get_dashboard_state

router = APIRouter()

@router.get("/kafka")
def kafka(state=Depends(get_dashboard_state)):
    metrics = state.kafka_metrics()

    return JSONResponse(
        content={
            "stage": "kafka",
            "description": "Kafka metrics consumer snapshot",
            "metrics": metrics,
        }
    )
