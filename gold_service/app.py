import time
import os
import sys
import threading
import pandas as pd
from src.state_manager import GoldStateManager
from src.aggregator import HealthAggregator
from src import config

_ROOT_FOR_IMPORT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _ROOT_FOR_IMPORT not in sys.path:
    sys.path.insert(0, _ROOT_FOR_IMPORT)
from common import duck_reader as dr


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
    last_compact = 0.0
    _compact_thread: threading.Thread | None = None

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
                files = dr.list_files(mod_path, max_files=15)
                if not files:
                    continue
                combined = dr.query_df(
                    "SELECT inference_ts, source_id, health_score, top_features, timestamp FROM read_parquet(?) WHERE CAST(inference_ts AS VARCHAR) > ?",
                    files, params=[last_ts],
                )
                if combined.empty:
                    continue
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
            except Exception as e:
                print(f"Failed to write Gold table: {e}")

        # Gold writes plain parquet (no _delta_log), so true Delta compaction
        # doesn't apply here — merge small files directly instead, on a timer
        # rather than every write since each write is cheap and frequent.
        # This preserves full history (merge, not delete-oldest) regardless
        # of how long the stream runs, unlike the old keep=200 retention cap
        # which silently dropped data older than ~20 minutes. Gold is also
        # append-only — the same (source_id, window) gets rewritten every
        # time that window's state is touched again, not just once (confirmed
        # on real data: 337 rows for only 98 unique windows). Dedup on
        # gold_write_ts so compaction keeps the most-recently-written value
        # per window instead of accumulating every intermediate version.
        if time.time() - last_compact >= 90:
            last_compact = time.time()
            if _compact_thread is None or not _compact_thread.is_alive():
                def _run_compact():
                    try:
                        merged = dr.compact_flat_dir(
                            config.GOLD_TABLE_DIR, min_files_to_compact=5,
                            dedup_subset=["source_id", "gold_window_ts"], dedup_sort_col="gold_write_ts",
                        )
                        if merged:
                            print(f"Compacted {merged} Gold files.")
                    except Exception as e:
                        print(f"Gold compaction failed: {e}")
                _compact_thread = threading.Thread(target=_run_compact, daemon=True)
                _compact_thread.start()

        time.sleep(config.POLL_INTERVAL)


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    main()
