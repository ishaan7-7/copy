import asyncio
import json
import logging
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
from aiokafka import AIOKafkaConsumer
from deltalake import write_deltalake

PROJECT_ROOT = Path(__file__).resolve().parents[2]
BRONZE_ROOT = PROJECT_ROOT / "data" / "delta" / "bronze"
STATE_DIR = Path(__file__).resolve().parents[1] / "state"
STATE_DIR.mkdir(parents=True, exist_ok=True)

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(levelname)s: %(message)s")
logger = logging.getLogger("LightWriter")

KAFKA_BOOTSTRAP = "localhost:9092"
CONSUMER_GROUP = "bronze-writer-v1"
POLL_TIMEOUT_MS = 2000
MAX_RECORDS_PER_POLL = 20000
DEDUP_TTL_SEC = 120.0
KAFKA_RETRY_START_SEC = 5
KAFKA_RETRY_MAX_SEC = 60

_pipeline_cfg = json.loads((PROJECT_ROOT / "config" / "pipeline_config.json").read_text(encoding="utf-8"))
MODULES = list(_pipeline_cfg["enabled_modules"])
TOPIC_TO_MODULE = {f"telemetry.{m}": m for m in MODULES}

_contract = json.loads((PROJECT_ROOT / "contracts" / "master.json").read_text(encoding="utf-8"))
MODULE_COLUMNS: dict = {}
MODULE_FLOAT_COLS: dict = {}
for _mod in MODULES:
    _cols = _contract["modules"][_mod]["columns"]
    _data_cols = [c for c in _cols if c.lower() != "source_id"]
    MODULE_COLUMNS[_mod] = ["row_hash", "ingest_ts", "writer_ts", "source_id"] + _data_cols
    MODULE_FLOAT_COLS[_mod] = {c for c in _data_cols if "float" in str(_cols[c].get("dtype", "")).lower() or "int" in str(_cols[c].get("dtype", "")).lower()}


class ModuleMetrics:
    def __init__(self, module: str):
        self.module = module
        self.file = STATE_DIR / f"writer_metrics_{module}.json"
        self.batch_id = 0
        self.total_rows = 0

    def flush(self, num_rows: int, backlog: int, interval_sec: float, duration_ms: float, status: str = "RUNNING") -> None:
        self.batch_id += 1
        self.total_rows += num_rows
        interval = max(interval_sec, 1e-3)
        payload = {
            "status": status,
            "last_updated": time.time(),
            "streams": {
                self.module: {
                    "status": "ACTIVE" if status == "RUNNING" else status,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "batch_id": self.batch_id,
                    "num_input_rows": num_rows,
                    "total_rows_processed": self.total_rows,
                    "backlog": backlog,
                    "input_rate": round(num_rows / interval, 2),
                    "process_rate": round(num_rows / max(duration_ms / 1000.0, 1e-3), 2) if num_rows else 0.0,
                    "duration_ms": round(duration_ms, 1),
                }
            },
        }
        tmp = self.file.with_suffix(".tmp")
        try:
            with open(tmp, "w", encoding="utf-8") as fh:
                json.dump(payload, fh)
            tmp.replace(self.file)
        except OSError as exc:
            logger.error(f"Metrics flush failed for {self.module}: {exc}")


class RowDeduper:
    def __init__(self):
        self._seen: dict = {}

    def is_new(self, row_hash: str) -> bool:
        now = time.monotonic()
        if row_hash in self._seen:
            return False
        self._seen[row_hash] = now + DEDUP_TTL_SEC
        return True

    def prune(self) -> None:
        now = time.monotonic()
        expired = [k for k, deadline in self._seen.items() if deadline < now]
        for k in expired:
            del self._seen[k]


def flatten_records(module: str, raw_values: list) -> list:
    rows = []
    for value in raw_values:
        try:
            event = json.loads(value)
            meta = event.get("metadata", {})
            data = event.get("data", {})
            row = {
                "row_hash": meta.get("row_hash"),
                "ingest_ts": meta.get("ingest_ts"),
                "source_id": meta.get("vehicle_id"),
            }
            for col in data:
                if col.lower() != "source_id":
                    row[col] = data[col]
            if row["row_hash"] and row["source_id"]:
                rows.append(row)
        except (json.JSONDecodeError, TypeError, AttributeError) as exc:
            logger.warning(f"Skipping malformed record on {module}: {exc}")
    return rows


def build_frame(module: str, rows: list) -> pd.DataFrame:
    df = pd.DataFrame(rows)
    df["writer_ts"] = pd.Timestamp.now(tz="UTC")
    df = df.reindex(columns=MODULE_COLUMNS[module])
    df["ingest_ts"] = pd.to_datetime(df["ingest_ts"], errors="coerce", utc=True)
    float_cols = MODULE_FLOAT_COLS[module]
    for col in df.columns:
        if col in float_cols:
            df[col] = pd.to_numeric(df[col], errors="coerce").astype("float64")
        elif col not in ("ingest_ts", "writer_ts"):
            df[col] = df[col].astype("object").where(df[col].notna(), None)
    return df


def write_bronze(module: str, df: pd.DataFrame) -> None:
    path = BRONZE_ROOT / module
    path.mkdir(parents=True, exist_ok=True)
    write_deltalake(
        path.as_posix(),
        df,
        mode="append",
        partition_by=["source_id"],
        schema_mode="merge",
    )


async def run_writer() -> None:
    metrics = {m: ModuleMetrics(m) for m in MODULES}
    dedupers = {m: RowDeduper() for m in MODULES}
    retry_delay = KAFKA_RETRY_START_SEC

    while True:
        consumer = AIOKafkaConsumer(
            *TOPIC_TO_MODULE.keys(),
            bootstrap_servers=KAFKA_BOOTSTRAP,
            group_id=CONSUMER_GROUP,
            auto_offset_reset="earliest",
            enable_auto_commit=False,
            session_timeout_ms=30000,
            heartbeat_interval_ms=10000,
            max_poll_interval_ms=300000,
        )
        try:
            await consumer.start()
            logger.info(f"Kafka consumer connected | topics={list(TOPIC_TO_MODULE)} | group={CONSUMER_GROUP}")
            retry_delay = KAFKA_RETRY_START_SEC
            last_cycle = time.monotonic()

            while True:
                batches = await consumer.getmany(timeout_ms=POLL_TIMEOUT_MS, max_records=MAX_RECORDS_PER_POLL)
                cycle_start = time.monotonic()
                interval_sec = cycle_start - last_cycle
                last_cycle = cycle_start

                per_module_values: dict = {m: [] for m in MODULES}
                for tp, records in batches.items():
                    module = TOPIC_TO_MODULE.get(tp.topic)
                    if module is None:
                        continue
                    per_module_values[module].extend(r.value for r in records)

                backlog: dict = {m: 0 for m in MODULES}
                for tp in consumer.assignment():
                    module = TOPIC_TO_MODULE.get(tp.topic)
                    if module is None:
                        continue
                    hw = consumer.highwater(tp)
                    if hw is None:
                        continue
                    try:
                        pos = await consumer.position(tp)
                        backlog[module] += max(0, hw - pos)
                    except Exception:
                        pass

                write_failed = False
                durations: dict = {m: 0.0 for m in MODULES}
                counts: dict = {m: 0 for m in MODULES}

                for module, raw_values in per_module_values.items():
                    if not raw_values:
                        continue
                    rows = flatten_records(module, raw_values)
                    deduper = dedupers[module]
                    rows = [r for r in rows if deduper.is_new(r["row_hash"])]
                    deduper.prune()
                    if not rows:
                        continue
                    t0 = time.monotonic()
                    try:
                        df = build_frame(module, rows)
                        await asyncio.to_thread(write_bronze, module, df)
                        counts[module] = len(df)
                        durations[module] = (time.monotonic() - t0) * 1000
                        logger.info(f"BATCH: {module} | Rows: {len(df)} | Total: {metrics[module].total_rows + len(df)} | Lag: {backlog[module]}")
                    except Exception as exc:
                        write_failed = True
                        logger.error(f"Bronze write failed for {module}: {exc}")

                for module in MODULES:
                    metrics[module].flush(
                        num_rows=counts[module],
                        backlog=backlog[module],
                        interval_sec=interval_sec,
                        duration_ms=durations[module],
                    )

                if not write_failed and batches:
                    try:
                        await consumer.commit()
                    except Exception as exc:
                        logger.error(f"Offset commit failed: {exc}")

        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.error(f"Kafka consumer error ({type(exc).__name__}): {exc} — retrying in {retry_delay}s")
            for module in MODULES:
                metrics[module].flush(num_rows=0, backlog=0, interval_sec=1.0, duration_ms=0.0, status="ERROR")
            await asyncio.sleep(retry_delay)
            retry_delay = min(retry_delay * 2, KAFKA_RETRY_MAX_SEC)
        finally:
            try:
                await consumer.stop()
            except Exception:
                pass


def main() -> None:
    logger.info(f"Starting Light Writer (no Spark) for modules: {MODULES}")
    try:
        asyncio.run(run_writer())
    except KeyboardInterrupt:
        logger.info("Light Writer stopped.")


if __name__ == "__main__":
    main()
