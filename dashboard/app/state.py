import time
from threading import Lock
from typing import Dict, Any, Callable

class DashboardState:
    """
    In-memory, TTL-based snapshot cache for dashboard metrics.
    """

    def __init__(
        self,
        *,
        replay_fetcher: Callable[[], Dict[str, Any]],
        ingest_fetcher: Callable[[], Dict[str, Any]],
        kafka_fetcher: Callable[[], Dict[str, Any]],
        ttl_seconds: int = 5,
    ):
        self._replay_fetcher = replay_fetcher
        self._ingest_fetcher = ingest_fetcher
        self._kafka_fetcher = kafka_fetcher
        self._ttl_seconds = ttl_seconds

        self._lock = Lock()
        self._last_refresh_ts: float = 0.0

        self._replay_metrics: Dict[str, Any] = {}
        self._ingest_metrics: Dict[str, Any] = {}
        self._kafka_metrics: Dict[str, Any] = {}

    # -------------------------------------------------
    # Internal refresh logic
    # -------------------------------------------------
    def _needs_refresh(self) -> bool:
        return (time.monotonic() - self._last_refresh_ts) >= self._ttl_seconds

    def _refresh(self) -> None:
        self._replay_metrics = self._replay_fetcher() or {}
        self._ingest_metrics = self._ingest_fetcher() or {}
        self._kafka_metrics = self._kafka_fetcher() or {}
        self._last_refresh_ts = time.monotonic()

    # -------------------------------------------------
    # Public read API
    # -------------------------------------------------
    def replay_metrics(self) -> Dict[str, Any]:
        with self._lock:
            if self._needs_refresh():
                self._refresh()
            return dict(self._replay_metrics)

    def ingest_metrics(self) -> Dict[str, Any]:
        with self._lock:
            if self._needs_refresh():
                self._refresh()
            return dict(self._ingest_metrics)

    def kafka_metrics(self) -> Dict[str, Any]:
        with self._lock:
            if self._needs_refresh():
                self._refresh()
            return dict(self._kafka_metrics)

    def vehicle_metrics(self) -> Dict[str, float]:
        """
        Helper to extract just the vehicle dictionary from the Kafka metrics.
        """
        with self._lock:
            if self._needs_refresh():
                self._refresh()
            # Return the nested 'vehicles' dict we created in the adapter
            return self._kafka_metrics.get("vehicles", {})

    def snapshot(self) -> Dict[str, Dict[str, Any]]:
        with self._lock:
            if self._needs_refresh():
                self._refresh()

            return {
                "replay": dict(self._replay_metrics),
                "ingest": dict(self._ingest_metrics),
                "kafka": dict(self._kafka_metrics),
            }

# Global singleton slot
dashboard_state: "DashboardState | None" = None
