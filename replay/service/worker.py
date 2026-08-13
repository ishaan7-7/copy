import csv
import json
import time
import hashlib
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, Any, Iterator, Tuple, Optional
from threading import Event

CHECKPOINT_EVERY_ROWS = 20

from replay.service.validator import SchemaValidator, RowValidationError
from replay.service.checkpoint import CheckpointStore
from replay.service.dlq import DLQWriter
from replay.service.http_client import HttpClient
from replay.service.metrics import (
    rows_attempted_total,
    rows_sent_total,
    rows_failed_validation_total,
    batch_latency_ms,
)


# -------------------------------------------------
# CSV reader (resume-safe)
# -------------------------------------------------
def read_csv_rows(
    *,
    csv_path: Path,
    start_row_index: int,
) -> Iterator[Tuple[int, Dict[str, Any]]]:
    if not csv_path.exists():
        raise FileNotFoundError(f"CSV not found: {csv_path}")

    if start_row_index < -1:
        raise ValueError("start_row_index must be >= -1")

    with csv_path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for idx, row in enumerate(reader):
            if idx <= start_row_index:
                continue
            yield idx, row


def read_first_timestamp(csv_path: Path) -> Optional[datetime]:
    try:
        with csv_path.open("r", encoding="utf-8", newline="") as f:
            reader = csv.DictReader(f)
            row = next(reader)
        return datetime.fromisoformat(row["timestamp"])
    except (OSError, StopIteration, ValueError, KeyError):
        return None


# -------------------------------------------------
# Deterministic row hashing
# -------------------------------------------------
def compute_row_hash(
    *,
    vehicle_id: str,
    module: str,
    timestamp: str,
    features: Dict[str, Any],
) -> str:
    canonical_payload = {
        "vehicle_id": vehicle_id,
        "module": module,
        "timestamp": timestamp,
        "features": {k: features[k] for k in sorted(features)},
    }

    serialized = json.dumps(
        canonical_payload,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    )

    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


# -------------------------------------------------
# Main worker (single source)
# -------------------------------------------------
def run_worker(
    *,
    source: Dict[str, Any],
    schema_validator: SchemaValidator,
    checkpoint_store: CheckpointStore,
    dlq_writer: DLQWriter,
    http_client: HttpClient,
    replay_mode: str,
    shutdown_event: Event,
    rows_per_second: Optional[float] = None,
    batch_size: Optional[int] = None,
    batch_interval_seconds: Optional[float] = None,
) -> None:
    vehicle_id = source["vehicle_id"]
    module = source["module"]
    source_id = source["source_id"]
    csv_path: Path = source["csv_path"]

    checkpoint = checkpoint_store.load(source_id)
    start_index = checkpoint["last_row_index"] if checkpoint else -1
    loop_pass = int((checkpoint or {}).get("loop_pass", 0))
    span_seconds = (checkpoint or {}).get("span_seconds")
    interval_seconds = (1.0 / rows_per_second) if rows_per_second else 1.0

    batch = []
    batch_start_ts = None

    while not shutdown_event.is_set():
        offset = timedelta(
            seconds=loop_pass * (span_seconds + interval_seconds)
        ) if loop_pass > 0 and span_seconds else None
        pass_started_at_top = start_index == -1
        first_ts = None
        last_ts = None
        last_index = start_index
        last_hash = ""
        rows_since_ckpt = 0

        for row_index, raw_row in read_csv_rows(
            csv_path=csv_path,
            start_row_index=start_index,
        ):
            if shutdown_event.is_set():
                break

            rows_attempted_total.inc()

            try:
                original_ts = datetime.fromisoformat(raw_row["timestamp"])
                if first_ts is None:
                    first_ts = original_ts
                last_ts = original_ts
                if offset is not None:
                    shifted = original_ts + offset
                    raw_row["timestamp"] = shifted.isoformat(sep=" ")
                    raw_row["date"] = shifted.date().isoformat()
            except (ValueError, KeyError):
                pass

            # -------------------------
            # Hash + validate
            # -------------------------
            try:
                row_hash = compute_row_hash(
                    vehicle_id=vehicle_id,
                    module=module,
                    timestamp=raw_row["timestamp"],
                    features=raw_row,
                )

                validated = schema_validator.validate_row(
                    module=module,
                    row=raw_row,
                )

            except RowValidationError as e:
                rows_failed_validation_total.inc()
                dlq_writer.write(
                    source_id=source_id,
                    vehicle_id=vehicle_id,
                    module=module,
                    row_index=row_index,
                    error_type="schema_validation",
                    error_message=e.message,
                    error_details=e.details,
                    raw_row=raw_row,
                )
                continue

            except Exception as e:
                rows_failed_validation_total.inc()
                dlq_writer.write(
                    source_id=source_id,
                    vehicle_id=vehicle_id,
                    module=module,
                    row_index=row_index,
                    error_type="hash_error",
                    error_message=str(e),
                    raw_row=raw_row,
                )
                continue

            payload = {
                "metadata": {
                    "row_hash": row_hash,
                    "vehicle_id": vehicle_id,
                    "module": module,
                    "source_file": csv_path.name,
                },
                "data": validated,
            }

            # -------------------------
            # Delivery
            # -------------------------
            try:
                if replay_mode == "fixed_rate":
                    http_client.post_json(payload)
                    rows_sent_total.inc()

                    if rows_per_second:
                        shutdown_event.wait(timeout=1.0 / rows_per_second)

                elif replay_mode == "batch":
                    if not batch:
                        batch_start_ts = time.monotonic()

                    batch.append(payload)

                    flush_due = (
                        (batch_size and len(batch) >= batch_size)
                        or (
                            batch_interval_seconds
                            and batch_start_ts
                            and (time.monotonic() - batch_start_ts >= batch_interval_seconds)
                        )
                    )

                    if flush_due:
                        with batch_latency_ms.time():
                            for item in batch:
                                http_client.post_json(item)
                                rows_sent_total.inc()
                        batch.clear()
                        batch_start_ts = None

                else:
                    raise ValueError(f"Unknown replay mode: {replay_mode}")

            except Exception as e:
                dlq_writer.write(
                    source_id=source_id,
                    vehicle_id=vehicle_id,
                    module=module,
                    row_index=row_index,
                    error_type="http_delivery",
                    error_message=str(e),
                    raw_row=raw_row,
                )
                continue

            # -------------------------
            # Checkpoint (only on success)
            # -------------------------
            last_index = row_index
            last_hash = row_hash
            rows_since_ckpt += 1
            if rows_since_ckpt >= CHECKPOINT_EVERY_ROWS:
                rows_since_ckpt = 0
                try:
                    checkpoint_store.save(
                        source_id=source_id,
                        last_row_index=row_index,
                        last_row_hash=row_hash,
                        loop_pass=loop_pass,
                        span_seconds=span_seconds,
                    )
                except Exception:
                    pass

        if rows_since_ckpt > 0 and last_index > start_index:
            try:
                checkpoint_store.save(
                    source_id=source_id,
                    last_row_index=last_index,
                    last_row_hash=last_hash,
                    loop_pass=loop_pass,
                    span_seconds=span_seconds,
                )
            except Exception:
                pass

        if shutdown_event.is_set():
            break

        if last_ts is None:
            break

        if span_seconds is None:
            if pass_started_at_top and first_ts is not None and last_ts > first_ts:
                span_seconds = (last_ts - first_ts).total_seconds()
            else:
                file_first_ts = read_first_timestamp(csv_path)
                if file_first_ts is not None and last_ts > file_first_ts:
                    span_seconds = (last_ts - file_first_ts).total_seconds()
        if span_seconds is None:
            break
        loop_pass += 1
        start_index = -1
        try:
            checkpoint_store.save(
                source_id=source_id,
                last_row_index=-1,
                last_row_hash="",
                loop_pass=loop_pass,
                span_seconds=span_seconds,
            )
        except Exception:
            pass

    # Final batch flush on shutdown
    if replay_mode == "batch" and batch:
        with batch_latency_ms.time():
            for item in batch:
                http_client.post_json(item)
                rows_sent_total.inc()
