import asyncio
import aiohttp
import json
import re
import logging
import uuid
from collections import defaultdict, deque
from typing import Dict, Any
from datetime import datetime, timezone
from aiokafka import AIOKafkaConsumer
from pathlib import Path

# --- Import Existing Config ---
try:
    from ingest.app.config_loader import IngestConfig
except ImportError:
    import sys
    sys.path.append(str(Path.cwd()))
    from ingest.app.config_loader import IngestConfig

# --- Configuration ---
INGEST_METRICS_URL = "http://127.0.0.1:8000/metrics"

PORTS_TO_CHECK = {
    "Zookeeper": 2181,
    "Kafka": 9092,
    "Ingest": 8000,
    "Replay": 9001,
}

VALIDATION_REGEX = re.compile(r'ingest_rows_validation_detail(?:_total)?\{.*vehicle_id="([^"]+)".*status="([^"]+)".*\}\s+(\d+\.?\d*)')
DLQ_GAUGE_REGEX = re.compile(r'dlq_size_files\s+(\d+\.?\d*)')

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("ObserverEngine")

class HybridObserver:
    def __init__(self):
        self.ingest_config = IngestConfig(Path("ingest/config/ingest_config.json"))
        self.lock = asyncio.Lock()
        self.running = False
        
        self.port_health: Dict[str, bool] = {k: False for k in PORTS_TO_CHECK}
        self.global_dlq_size = 0
        
        self._max_vehicles = 20
        self.vehicle_data = defaultdict(lambda: {
            "accepted": 0,
            "rejected": 0,
            "latency_window": deque(maxlen=50),
            "last_seen": 0,
            "latest_payload": {},
            "module_payloads": {},
        })

    async def start(self):
        self.running = True
        logger.info("Starting Industrial Observer Engine (Module Inspector Enabled)...")
        await asyncio.gather(
            self._monitor_ports(),
            self._poll_http_metrics(),
            self._consume_kafka_stream()
        )

    async def stop(self):
        self.running = False
        logger.info("Stopping Observer Engine.")

    # ---------------------------------------------------------
    # Task A: Port Scanner
    # ---------------------------------------------------------
    async def _monitor_ports(self):
        while self.running:
            results = {}
            for name, port in PORTS_TO_CHECK.items():
                try:
                    _, writer = await asyncio.wait_for(
                        asyncio.open_connection("127.0.0.1", port), timeout=0.2
                    )
                    writer.close()
                    await writer.wait_closed()
                    results[name] = True
                except:
                    results[name] = False
            
            async with self.lock:
                self.port_health = results
            await asyncio.sleep(2)

    # ---------------------------------------------------------
    # Task B: HTTP Metrics Poller
    # ---------------------------------------------------------
    async def _poll_http_metrics(self):
        async with aiohttp.ClientSession() as session:
            while self.running:
                if self.port_health.get("Ingest", False):
                    try:
                        async with session.get(INGEST_METRICS_URL, timeout=1) as resp:
                            if resp.status == 200:
                                text = await resp.text()
                                self._parse_metrics(text)
                    except Exception:
                        pass
                await asyncio.sleep(2)

    def _parse_metrics(self, text: str):
        lines = text.splitlines()
        temp_dlq = 0
        for line in lines:
            if line.startswith("#"): continue
            
            v_match = VALIDATION_REGEX.search(line)
            if v_match:
                v_id, status, val = v_match.groups()
                count = int(float(val))
                if status == "rejected":
                    if v_id in self.vehicle_data:
                        self.vehicle_data[v_id]["rejected"] = count
                continue

            d_match = DLQ_GAUGE_REGEX.search(line)
            if d_match:
                temp_dlq = int(float(d_match.group(1)))
        
        if self.running:
             self.global_dlq_size = temp_dlq

    # ---------------------------------------------------------
    # Task C: Kafka Listener
    # ---------------------------------------------------------
    async def _consume_kafka_stream(self):
        topics = list(self.ingest_config.topic_mapping.values())
        bootstrap = self.ingest_config.kafka_bootstrap_servers
        retry_delay = 5

        while self.running:
            unique_group_id = f"telemetry-observer-{uuid.uuid4().hex[:8]}"
            consumer = AIOKafkaConsumer(
                *topics,
                bootstrap_servers=bootstrap,
                group_id=unique_group_id,
                auto_offset_reset="latest",
            )
            try:
                await consumer.start()
                logger.info(f"Kafka consumer connected | topics={topics} | broker={bootstrap}")
                retry_delay = 5

                async for msg in consumer:
                    if not self.running:
                        break
                    try:
                        payload = json.loads(msg.value)
                        meta = payload.get("metadata", {})
                        v_id = meta.get("vehicle_id")
                        module = meta.get("module", "unknown")
                        ingest_ts_str = meta.get("ingest_ts")

                        latency_ms = 0.0
                        now_utc = datetime.now(timezone.utc)
                        if ingest_ts_str:
                            ts = datetime.fromisoformat(ingest_ts_str)
                            if ts.tzinfo is None:
                                ts = ts.replace(tzinfo=timezone.utc)
                            latency_ms = max(0.0, min(30000.0, (now_utc - ts).total_seconds() * 1000))

                        if v_id:
                            async with self.lock:
                                if v_id not in self.vehicle_data and len(self.vehicle_data) >= self._max_vehicles:
                                    pass
                                else:
                                    entry = self.vehicle_data[v_id]
                                    entry["accepted"] += 1
                                    entry["latency_window"].append(latency_ms)
                                    entry["last_seen"] = asyncio.get_event_loop().time()
                                    entry["latest_payload"] = payload
                                    entry["module_payloads"][module] = payload

                    except Exception as e:
                        logger.warning(f"Message parse error: {e}")

            except Exception as e:
                logger.error(f"Kafka consumer error ({type(e).__name__}): {e} — retrying in {retry_delay}s")
                retry_delay = min(retry_delay * 2, 60)
            finally:
                try:
                    await consumer.stop()
                except Exception:
                    pass

            if self.running:
                await asyncio.sleep(retry_delay)

    # ---------------------------------------------------------
    # Public API: Get Snapshot
    # ---------------------------------------------------------
    async def get_snapshot(self) -> Dict[str, Any]:
        async with self.lock:
            vehicle_list = []
            global_lat_sum = 0.0
            global_lat_count = 0
            total_rows = 0
            current_time = asyncio.get_event_loop().time()

            sorted_keys = sorted(self.vehicle_data.keys())

            for v_id in sorted_keys:
                data = self.vehicle_data[v_id]
                acc = data["accepted"]
                rej = data["rejected"]
                total = acc + rej
                val_rate = (acc / total * 100.0) if total > 0 else 100.0
                
                lat_window = list(data["latency_window"])
                v_lat_avg = sum(lat_window) / len(lat_window) if lat_window else 0.0
                global_lat_sum += sum(lat_window)
                global_lat_count += len(lat_window)
                
                ago = round(current_time - data["last_seen"], 1)

                vehicle_list.append({
                    "vehicle_id": v_id,
                    "rows_processed": acc,
                    "rejected_rows": rej,
                    "validation_rate": round(val_rate, 1),
                    "avg_latency": round(v_lat_avg, 1),
                    "last_seen_sec": ago,
                    "latest_payload": data["latest_payload"],
                    "module_payloads": data["module_payloads"],
                })
                total_rows += acc

            global_avg_lat = (global_lat_sum / global_lat_count) if global_lat_count > 0 else 0.0

            return {
                "system_health": dict(self.port_health),
                "global_stats": {
                    "total_rows": total_rows,
                    "active_vehicles": len(vehicle_list),
                    "avg_latency": round(global_avg_lat, 1),
                    "dlq_backlog": self.global_dlq_size
                },
                "vehicles": vehicle_list
            }

if __name__ == "__main__":
    async def test_runner():
        observer = HybridObserver()
        asyncio.create_task(observer.start())
        print("--- Observer Started ---")
        try:
            while True:
                await asyncio.sleep(5)
                snap = await observer.get_snapshot()
                if snap['vehicles']:
                    v1 = snap['vehicles'][0]
                    print(f"Vehicle: {v1['vehicle_id']} | Modules: {list(v1['module_payloads'].keys())}")
        except KeyboardInterrupt:
            await observer.stop()

    try:
        asyncio.run(test_runner())
    except KeyboardInterrupt:
        pass