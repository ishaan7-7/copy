from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from dashboard.app.dependencies import get_dashboard_state

router = APIRouter()

@router.get("/vehicles")
def list_vehicles(state=Depends(get_dashboard_state)):
    # Fetch the dict: {"sim001": 150.0, "sim002": 300.0}
    data = state.vehicle_metrics()
    
    # Convert to a list of objects for the frontend
    vehicle_list = [
        {"vehicle_id": v_id, "rows_processed": count}
        for v_id, count in data.items()
    ]
    
    # Sort for consistent display
    vehicle_list.sort(key=lambda x: x["vehicle_id"])

    return JSONResponse(content={"vehicles": vehicle_list})

@router.get("/vehicles/{vehicle_id}")
def vehicle_detail(vehicle_id: str, state=Depends(get_dashboard_state)):
    data = state.vehicle_metrics()
    
    if vehicle_id not in data:
        return JSONResponse(
            status_code=404,
            content={"error": f"Vehicle {vehicle_id} not found in active stream"}
        )

    return JSONResponse(
        content={
            "vehicle_id": vehicle_id,
            "rows_processed": data[vehicle_id],
            "status": "active"
        }
    )
