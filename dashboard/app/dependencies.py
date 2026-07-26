# dashboard/app/dependencies.py
from fastapi import HTTPException
import dashboard.app.state as global_state

def get_dashboard_state() -> global_state.DashboardState:
    """
    Dependency to retrieve the initialized dashboard state.
    Raises 503 if state is not ready (e.g. app starting up).
    """
    if global_state.dashboard_state is None:
        raise HTTPException(
            status_code=503,
            detail="dashboard_state_not_initialized",
        )
    return global_state.dashboard_state