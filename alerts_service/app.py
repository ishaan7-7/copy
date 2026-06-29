
import time
import os
from pathlib import Path
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
from src.state_manager import AlertStateManager
from src.alert_engine import AlertEngine
from src import config


def main():
    print("=====================================================")
    print("STARTING GOLD AGGREGATOR (ALERTS & FAULTS)")
    print(f"Global Batch Limit: {config.BATCH_SIZE} rows per loop")
    print(f"Leaky Bucket Math: CRITICAL(+{config.SCORE_DELTAS.get('CRITICAL',0)}) | WARNING(+{config.SCORE_DELTAS.get('WARNING',0)}) | NORMAL({config.SCORE_DELTAS.get('NORMAL',0)})")
    print("=====================================================")

    state = AlertStateManager()
    engine = AlertEngine(state)
    last_silver_mtime = 0.0

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
                pq_files = []
                for entry in os.scandir(mod_path):
                    if entry.is_file() and entry.name.endswith(".parquet"):
                        pq_files.append((entry.path, entry.stat().st_mtime))
                    elif entry.is_dir() and not entry.name.startswith("_"):
                        for sub in os.scandir(entry.path):
                            if sub.is_file() and sub.name.endswith(".parquet"):
                                pq_files.append((sub.path, sub.stat().st_mtime))
                pq_files.sort(key=lambda x: x[1], reverse=True)

                dfs = []
                rows_collected = 0
                for fp, _ in pq_files[:15]:
                    try:
                        df = pd.read_parquet(fp)
                        if not df.empty and "inference_ts" in df.columns:
                            df = df[df["inference_ts"] > last_ts]
                            if not df.empty:
                                dfs.append(df)
                                rows_collected += len(df)
                                if rows_collected >= per_module_limit:
                                    break
                    except Exception:
                        pass

                if dfs:
                    combined = pd.concat(dfs, ignore_index=True)
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
            _cleanup_old_files(config.GOLD_ALERTS_DIR, keep=100)

        for mod, ts in new_checkpoints.items():
            state.checkpoints[mod] = ts

        if alert_updates:
            state.save_state()
            print(f"Wrote {len(alert_updates)} alert states.")
        elif new_checkpoints:
            import json
            with open(config.CHECKPOINT_FILE, "w") as f:
                json.dump(state.checkpoints, f, indent=4)

        time.sleep(config.POLL_INTERVAL)


def _cleanup_old_files(directory, keep=100):
    try:
        files = []
        for entry in os.scandir(directory):
            if entry.is_file() and entry.name.endswith(".parquet"):
                files.append((entry.path, entry.stat().st_mtime))
        if len(files) <= keep:
            return
        files.sort(key=lambda x: x[1])
        for fp, _ in files[:len(files) - keep]:
            try:
                os.remove(fp)
            except Exception:
                pass
    except Exception:
        pass


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    main()
