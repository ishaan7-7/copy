from pathlib import Path
import json
from typing import Any, Dict
from urllib.parse import urlparse


class DashboardConfigError(RuntimeError):
    pass


class DashboardConfig:
    REQUIRED_TOP_LEVEL_KEYS = {
        "replay_metrics_url",
        "ingest_metrics_url",
        "kafka_metrics_url",
        "http",
    }

    REQUIRED_HTTP_KEYS = {"port"}

    def __init__(self, config_path: Path):
        self.config_path = config_path

        self._raw: Dict[str, Any] = {}

        self._replay_metrics_url: str
        self._ingest_metrics_url: str
        self._kafka_metrics_url: str
        self._http_port: int

        self._load_and_validate()

    # -------------------------------------------------
    # Internal load & validation
    # -------------------------------------------------
    def _load_and_validate(self) -> None:
        if not self.config_path.exists():
            raise DashboardConfigError(
                f"dashboard_config.json not found at: {self.config_path}"
            )

        try:
            with self.config_path.open("r", encoding="utf-8") as f:
                self._raw = json.load(f)
        except json.JSONDecodeError as e:
            raise DashboardConfigError(
                "dashboard_config.json is not valid JSON"
            ) from e

        if not isinstance(self._raw, dict):
            raise DashboardConfigError(
                "dashboard_config.json must be a JSON object"
            )

        missing = self.REQUIRED_TOP_LEVEL_KEYS - self._raw.keys()
        if missing:
            raise DashboardConfigError(
                f"Missing required keys: {sorted(missing)}"
            )

        self._replay_metrics_url = self._validate_url(
            self._raw["replay_metrics_url"],
            key_name="replay_metrics_url",
        )
        self._ingest_metrics_url = self._validate_url(
            self._raw["ingest_metrics_url"],
            key_name="ingest_metrics_url",
        )
        self._kafka_metrics_url = self._validate_url(
            self._raw["kafka_metrics_url"],
            key_name="kafka_metrics_url",
        )

        self._http_port = self._validate_http(self._raw["http"])

    # -------------------------------------------------
    # Validators
    # -------------------------------------------------
    def _validate_url(self, value: Any, *, key_name: str) -> str:
        if not isinstance(value, str):
            raise DashboardConfigError(
                f"{key_name} must be a string"
            )

        parsed = urlparse(value)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise DashboardConfigError(
                f"{key_name} must be a valid http(s) URL"
            )

        # Normalize: strip trailing slash
        return value.rstrip("/")

    def _validate_http(self, http_cfg: Any) -> int:
        if not isinstance(http_cfg, dict):
            raise DashboardConfigError("http must be an object")

        missing = self.REQUIRED_HTTP_KEYS - http_cfg.keys()
        if missing:
            raise DashboardConfigError(
                f"http missing keys: {sorted(missing)}"
            )

        port = http_cfg["port"]
        if not isinstance(port, int) or not (1024 <= port <= 65535):
            raise DashboardConfigError(
                "http.port must be an integer between 1024 and 65535"
            )

        return port

    # -------------------------------------------------
    # Public read-only properties
    # -------------------------------------------------
    @property
    def replay_metrics_url(self) -> str:
        return self._replay_metrics_url

    @property
    def ingest_metrics_url(self) -> str:
        return self._ingest_metrics_url

    @property
    def kafka_metrics_url(self) -> str:
        return self._kafka_metrics_url

    @property
    def http_port(self) -> int:
        return self._http_port
