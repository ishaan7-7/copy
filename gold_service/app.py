import time
import os
from pathlib import Path
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
from src.state_manager import GoldStateManager
from src.aggregator import HealthAggregator
from src import config


def main():
    print("=====================================================")
    print("STARTING GOLD AGGREGATOR (VEHICLE HEALTH)")
    print(f"Batch Limit: {config.BATCH_SIZE} rows per module")
    print(f"Aggregation Window: {config.AGGREGATION_WINDOW_SEC} seconds")
    print(f"Enabled Modules: {config.ENABLED_MODULES}")
    print("=====================================================")

    state = GoldStateManager()
    aggregator = HealthAggregator(state)
    last_silver_mtime = 0.0

    os.makedirs(config.GOLD_TABLE_DIR, exist_ok=True)

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
                                if rows_collected >= config.BATCH_SIZE:
                                    break
                    except Exception:
                        pass

                if dfs:
                    combined = pd.concat(dfs, ignore_index=True)
                    combined = combined.sort_values("inference_ts", ascending=True).head(config.BATCH_SIZE)
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

        freq_str = f"{config.AGGREGATION_WINDOW_SEC}s"
        combined_df["window_ts"] = combined_df["timestamp"].dt.floor(freq_str)

        gold_records = []

        for (sim_id, window_ts), group in combined_df.groupby(["source_id", "window_ts"]):
            for _, row in group.iterrows():
                state.update_module_state(
                    sim_id=sim_id,
                    module=row["module_name"],
                    health=row["health_score"],
                    features_json=row["top_features"],
                )

            gold_row = aggregator.compute_gold_record(sim_id, str(window_ts))
            gold_records.append(gold_row)

        if gold_records:
            gold_df = pd.DataFrame(gold_records)
            try:
                out_path = os.path.join(
                    config.GOLD_TABLE_DIR,
                    f"gold_{int(time.time()*1000)}.parquet",
                )
                gold_df.to_parquet(out_path, index=False)

                for mod, ts in new_checkpoints.items():
                    state.checkpoints[mod] = ts
                state.save_state()

                print(f"Wrote {len(gold_df)} Gold records.")
                _cleanup_old_files(config.GOLD_TABLE_DIR, keep=200)
            except Exception as e:
                print(f"Failed to write Gold table: {e}")

        time.sleep(config.POLL_INTERVAL)


def _cleanup_old_files(directory, keep=200):
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
