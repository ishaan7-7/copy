
import time
import os
import sys
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
from src.state_manager import AlertStateManager
from src.alert_engine import AlertEngine
from src import config

_ROOT_FOR_IMPORT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _ROOT_FOR_IMPORT not in sys.path:
    sys.path.insert(0, _ROOT_FOR_IMPORT)
from common import duck_reader as dr


def main():
    print("=====================================================")
    print("STARTING GOLD AGGREGATOR (ALERTS & FAULTS)")
    print(f"Global Batch Limit: {config.BATCH_SIZE} rows per loop")
    print(f"Leaky Bucket Math: CRITICAL(+{config.SCORE_DELTAS.get('CRITICAL',0)}) | WARNING(+{config.SCORE_DELTAS.get('WARNING',0)}) | NORMAL({config.SCORE_DELTAS.get('NORMAL',0)})")
    print("=====================================================")

    state = AlertStateManager()
    engine = AlertEngine(state)
    last_silver_mtime = 0.0
    last_compact = 0.0

    ALERT_SCHEMA = pa.schema([
        ("alert_id", pa.string()),
        ("source_id", pa.string()),
        ("module", pa.string()),
        ("status", pa.string()),
        ("alert_start_ts", pa.string()),
        ("alert_end_ts", pa.string()),
        ("peak_anomaly_ts", pa.string()),
        ("max_composite_score", pa.float64()),
        ("top_10_features", pa.string()),
        ("last_updated_ts", pa.string())
    ])

    os.makedirs(config.GOLD_ALERTS_DIR, exist_ok=True)

    while True:
        current_mtime = 0.0
        for mod in config.ENABLED_MODULES:
            p = os.path.join(config.SILVER_DIR, mod)
            if not os.path.exists(p):
                continue
            try:
                for entry in os.scandir(p):
                    if entry.is_file() and entry.name.endswith(".parquet"):
                        mt = entry.stat().st_mtime
                        if mt > current_mtime:
                            current_mtime = mt
                    elif entry.is_dir() and not entry.name.startswith("_"):
                        for sub in os.scandir(entry.path):
                            if sub.is_file() and sub.name.endswith(".parquet"):
                                mt = sub.stat().st_mtime
                                if mt > current_mtime:
                                    current_mtime = mt
            except Exception:
                pass

        if current_mtime > 0 and current_mtime <= last_silver_mtime:
            time.sleep(config.POLL_INTERVAL)
            continue
        last_silver_mtime = current_mtime

        raw_frames = []
        new_checkpoints = {}
        per_module_limit = max(1, config.BATCH_SIZE // len(config.ENABLED_MODULES))

        for mod in config.ENABLED_MODULES:
            mod_path = os.path.join(config.SILVER_DIR, mod)
            if not os.path.exists(mod_path):
                continue
            try:
                last_ts = state.checkpoints.get(mod, "1970-01-01")
                files = dr.list_files(mod_path, max_files=15)
                if not files:
                    continue
                combined = dr.query_df(
                    "SELECT * FROM read_parquet(?) WHERE CAST(inference_ts AS VARCHAR) > ?",
                    files, params=[last_ts],
                )
                if combined.empty:
                    continue
                combined = combined.sort_values("inference_ts", ascending=True).head(per_module_limit)
                combined["module_name"] = mod
                if "source_id" not in combined.columns:
                    combined["source_id"] = "unknown"
                raw_frames.append(combined)
                new_checkpoints[mod] = str(combined["inference_ts"].max())
            except Exception:
                pass

        if not raw_frames:
            time.sleep(config.POLL_INTERVAL)
            continue

        combined_df = pd.concat(raw_frames, ignore_index=True)
        combined_df["timestamp"] = pd.to_datetime(combined_df["timestamp"])
        combined_df = combined_df.sort_values("timestamp", ascending=True)

        print(f"Evaluating batch of {len(combined_df)} rows through Leaky Bucket...")

        alert_updates = {}
        for _, row in combined_df.iterrows():
            payload = engine.process_row(row)
            if payload:
                alert_updates[payload["alert_id"]] = payload

        if alert_updates:
            updates_df = pd.DataFrame(list(alert_updates.values()))
            pa_table = pa.Table.from_pandas(updates_df, schema=ALERT_SCHEMA)
            out_path = os.path.join(
                config.GOLD_ALERTS_DIR,
                f"alerts_{int(time.time()*1000)}.parquet",
            )
            pq.write_table(pa_table, out_path)

        for mod, ts in new_checkpoints.items():
            state.checkpoints[mod] = ts

        if alert_updates:
            state.save_state()
            print(f"Wrote {len(alert_updates)} alert states.")
        elif new_checkpoints:
            import json
            with open(config.CHECKPOINT_FILE, "w") as f:
                json.dump(state.checkpoints, f, indent=4)

        # Alerts writes plain parquet (no _delta_log) with upsert-style
        # semantics — the same alert_id is rewritten on every status
        # transition (OPEN -> updated score -> CLOSED) since the move off
        # DeltaTable's merge(). Without dedup, every historical version
        # accumulates forever (confirmed on real data: 441 rows for just 28
        # unique alerts). Compaction here both bounds file count AND fixes
        # that correctness bug by keeping only the most-recently-updated row
        # per alert_id.
        if time.time() - last_compact >= 90:
            last_compact = time.time()
            try:
                merged = dr.compact_flat_dir(
                    config.GOLD_ALERTS_DIR, min_files_to_compact=5,
                    dedup_subset=["alert_id"], dedup_sort_col="last_updated_ts",
                )
                if merged:
                    print(f"Compacted {merged} Alert files.")
            except Exception as e:
                print(f"Alert compaction failed: {e}")

        time.sleep(config.POLL_INTERVAL)


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    main()
