import os
import time
import threading
from pathlib import Path
from deltalake import write_deltalake, DeltaTable
from src import config

# Each write creates a new small Delta file (per vehicle, per module, per
# ~5s cycle) with no compaction — over a 20-min stream this grows to ~1,200
# files/module with nothing bounding it. Periodically merge the small files
# into one and physically remove the superseded ones. retention_hours=0 is
# intentional: this is a short-lived demo stream with no need for Delta's
# time-travel/audit retention, and the actual safety margin against deleting
# a file a concurrent reader is mid-read on comes from the compaction cadence
# (60s, vastly longer than any reader's list-then-read window) plus every
# reader's per-file fallback (common/duck_reader.py) tolerating a missing file.
_COMPACT_INTERVAL_SEC = 60


class SilverWriter:
    def __init__(self):
        self._last_compact: dict = {}
        self._compact_lock = threading.Lock()

    def write(self, df, module):
        path = os.path.join(config.SILVER_DIR, module)
        os.makedirs(path, exist_ok=True)

        try:
            write_deltalake(
                Path(path).as_posix(),
                df,
                mode="append",
                schema_mode="merge"
            )
        except Exception as e:
            print(f"Failed to write {module} to Silver: {e}")
            raise e

        now = time.time()
        with self._compact_lock:
            due = now - self._last_compact.get(module, 0) >= _COMPACT_INTERVAL_SEC
            if due:
                self._last_compact[module] = now

        if due:
            threading.Thread(target=self._compact, args=(module, path), daemon=True).start()

    def _compact(self, module, path):
        try:
            dt = DeltaTable(Path(path).as_posix())
            dt.optimize.compact()
            dt.vacuum(retention_hours=0, dry_run=False, enforce_retention_duration=False)
        except Exception as e:
            print(f"Silver compaction failed for {module}: {e}")
