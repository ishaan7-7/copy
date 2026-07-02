from pathlib import Path

from dashboard.app.config_loader import DashboardConfig
from dashboard.app.state import DashboardState, dashboard_state
from dashboard.app.adapters.replay_metrics import fetch_replay_metrics
from dashboard.app.adapters.ingest_metrics import fetch_ingest_metrics
from dashboard.app.adapters.kafka_metrics import fetch_kafka_metrics


def init_dashboard_state() -> DashboardState:
    config = DashboardConfig(
        config_path=(
            Path(__file__).parents[1]
            / "config"
            / "dashboard_config.json"
        )
    )

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

    # Assign to global slot
    import dashboard.app.state as state_module
    state_module.dashboard_state = state

    return state
