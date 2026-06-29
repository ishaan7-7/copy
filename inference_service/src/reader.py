import os
from pathlib import Path
import pandas as pd
from src import config


class BronzeReader:
    def __init__(self, state_manager):
        self.state = state_manager
        self._last_mtime = {}

    def get_new_data(self, module):
        path = os.path.join(config.BRONZE_DIR, module)
        if not os.path.exists(path):
            return pd.DataFrame()

        try:
            pq_files = []
            vid_map = {}
            for entry in os.scandir(path):
                if entry.is_dir() and entry.name.startswith("source_id="):
                    vid = entry.name.split("=", 1)[1]
                    try:
                        for f in os.scandir(entry.path):
                            if f.is_file() and f.name.endswith(".parquet"):
                                pq_files.append((f.path, f.stat().st_mtime))
                                vid_map[f.path] = vid
                    except Exception:
                        pass

            if not pq_files:
                return pd.DataFrame()

            latest_mtime = max(mt for _, mt in pq_files)
            if latest_mtime <= self._last_mtime.get(module, 0):
                return pd.DataFrame()
            self._last_mtime[module] = latest_mtime

            pq_files.sort(key=lambda x: x[1], reverse=True)
            recent_files = [fp for fp, _ in pq_files[:15]]

            checkpoints = [v for k, v in self.state.checkpoints.items() if k.endswith(f"_{module}")]

            dfs = []
            for fp in recent_files:
                try:
                    df = pd.read_parquet(fp)
                    if not df.empty:
                        if "source_id" not in df.columns:
                            df["source_id"] = vid_map.get(fp, "unknown")
                        dfs.append(df)
                except Exception:
                    pass

            if not dfs:
                return pd.DataFrame()

            combined = pd.concat(dfs, ignore_index=True)

            if checkpoints:
                min_watermark = str(min(checkpoints))
                combined = combined[combined['ingest_ts'].astype(str) > min_watermark]

            if combined.empty:
                return combined

            if 'ingest_ts' in combined.columns:
                combined = combined.sort_values('ingest_ts', ascending=True)

            return combined

        except Exception as e:
            print(f"[READER ERROR] Failed to read Bronze for {module}: {repr(e)}")
            return pd.DataFrame()