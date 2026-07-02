
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from dashboard.app.dependencies import get_dashboard_state

router = APIRouter()

@router.get("/overview")
def overview(state=Depends(get_dashboard_state)):
    snapshot = state.snapshot()

    replay = snapshot.get("replay", {})
    ingest = snapshot.get("ingest", {})
    kafka = snapshot.get("kafka", {})

    kafka_total_rows = kafka.get("kafka_rows_total", 0)

    
    latency_sum = kafka.get("kafka_processing_latency_ms_sum", 0.0)
    latency_count = kafka.get("kafka_processing_latency_ms_count", 0.0)

    avg_latency = 0.0
    if latency_count > 0:
        avg_latency = latency_sum / latency_count

    return JSONResponse(
        content={
            "replay": {
                "active_sources": replay.get("active_sources"),
            },
            "ingest": {
                "rows_accepted": ingest.get("ingest_rows_accepted_total"),
                "rows_rejected": ingest.get("ingest_rows_rejected_total"),
            },
            "kafka": {
                "total_rows": kafka_total_rows,
                # Replaced p50/p95 with avg because it is mathematically derived from available metrics
                "latency_avg_ms": round(avg_latency, 2) 
            },
        }
    )
