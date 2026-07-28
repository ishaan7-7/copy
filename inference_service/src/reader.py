import os
import sys
import pandas as pd
from src import config

_ROOT_FOR_IMPORT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
if _ROOT_FOR_IMPORT not in sys.path:
    sys.path.insert(0, _ROOT_FOR_IMPORT)
from common import duck_reader as dr


class BronzeReader:
    def __init__(self, state_manager):
        self.state = state_manager
        self._last_mtime = {}

    def get_new_data(self, module):
        path = os.path.join(config.BRONZE_DIR, module)
        if not os.path.exists(path):
            return pd.DataFrame()

        try:
            # Cheap mtime pre-check across all partitions before paying for a
            # DuckDB read — skip entirely when nothing changed since last poll.
            latest_mtime = 0.0
            try:
                for entry in os.scandir(path):
                    if entry.is_dir() and entry.name.startswith("source_id="):
                        for f in os.scandir(entry.path):
                            if f.is_file() and f.name.endswith(".parquet"):
                                mt = f.stat().st_mtime
                                if mt > latest_mtime:
                                    latest_mtime = mt
            except Exception:
                pass

            if latest_mtime == 0.0:
                return pd.DataFrame()
            if latest_mtime <= self._last_mtime.get(module, 0):
                return pd.DataFrame()
            self._last_mtime[module] = latest_mtime

            # Per-partition file cap (not a global top-15 across all
            # vehicles) — guarantees every vehicle's latest data is read
            # each cycle instead of letting a few high-frequency writers
            # crowd out the rest of the fleet from a shared top-N list.
            files = dr.list_partitioned_files(path, max_files_per_partition=100)
            if not files:
                return pd.DataFrame()

            suffix = f"_{module}"
            checkpoints = {
                k[: -len(suffix)]: str(v)
                for k, v in self.state.checkpoints.items()
                if k.endswith(suffix)
            }

            if checkpoints:
                pairs = ", ".join("(?, ?)" for _ in checkpoints)
                params: list = []
                for sid, wm in checkpoints.items():
                    params.extend([sid, wm])
                params.append(config.BATCH_SIZE)
                sql = (
                    "SELECT * FROM ("
                    "SELECT t.*, ROW_NUMBER() OVER ("
                    "PARTITION BY t.source_id ORDER BY CAST(t.ingest_ts AS VARCHAR)"
                    ") AS rn "
                    "FROM read_parquet(?) t "
                    f"LEFT JOIN (VALUES {pairs}) AS w(sid, wm) ON t.source_id = w.sid "
                    "WHERE CAST(t.ingest_ts AS VARCHAR) > COALESCE(w.wm, '1970-01-01')"
                    ") WHERE rn <= ?"
                )
                combined = dr.query_df(sql, files, params=params, hive_partitioning=True)
                if "rn" in combined.columns:
                    combined = combined.drop(columns=["rn"])
            else:
                combined = dr.query_df("SELECT * FROM read_parquet(?)", files, hive_partitioning=True)

            if combined.empty:
                return combined

            if "ingest_ts" in combined.columns:
                combined = combined.sort_values("ingest_ts", ascending=True)

            return combined

        except Exception as e:
            print(f"[READER ERROR] Failed to read Bronze for {module}: {repr(e)}")
            return pd.DataFrame()
