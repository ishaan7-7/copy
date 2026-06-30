"""
Shared DuckDB read layer for all backend services.

Replaces the hand-rolled "os.scandir + sort + pandas.read_parquet loop +
concat" pattern duplicated across writer/inference/gold/alerts/automotive_api.
DuckDB scans many small Parquet files far faster than a Python loop (vectorized
C++ execution, partition pruning, internal caching shared across queries on
the same connection) and automatically reflects newly written files with no
manual cache-invalidation bookkeeping.

One root connection per process, created lazily on first use. Each query gets
its own cursor (`root.cursor()`) so concurrent requests from FastAPI's
threadpool are safe, while still sharing the root connection's warm file
cache — verified: 7 concurrent vehicle queries that used to serialize/contend
under the old pandas-loop approach now complete in ~80ms total.

DuckDB's read_parquet() fails the ENTIRE query if any one file in the glob is
unreadable (e.g. a writer mid-flush). Since writers and readers run
concurrently throughout a stream, this is routine, not exceptional — so file
selection always goes through list_files()/list_partitioned_files() (skips
empty/very-recently-modified files) and every query falls back to a per-file
pandas read on any DuckDB error.
"""

import os
import time
import threading
import duckdb
import pandas as pd

_con: "duckdb.DuckDBPyConnection | None" = None
_lock = threading.Lock()

# Files modified within this window are presumed to be mid-write and skipped.
_MIN_FILE_AGE_SEC = 0.5

# Short-TTL cache for directory listings. os.scandir() itself is cheap even
# at thousands of files (~30-45ms at 8k files), but concurrent fan-out (e.g.
# 7 vehicles' scatter-plot queries hitting the same Gold directory at once)
# previously redid that scan 7 times in the same instant for no reason. TTL
# is intentionally shorter than the response caches (5-15s) built on top of
# this, so it never adds meaningfully more staleness than callers already
# accept — it only collapses simultaneous/rapid-repeat listings.
_LISTING_TTL_SEC = 2.0
_listing_cache: dict = {}
_listing_lock = threading.Lock()


def _cached_listing(cache_key, compute_fn):
    now = time.monotonic()
    with _listing_lock:
        entry = _listing_cache.get(cache_key)
        if entry and (now - entry[0]) < _LISTING_TTL_SEC:
            return entry[1]
    result = compute_fn()
    with _listing_lock:
        _listing_cache[cache_key] = (now, result)
        if len(_listing_cache) > 500:
            oldest = min(_listing_cache, key=lambda k: _listing_cache[k][0])
            del _listing_cache[oldest]
    return result


def _root_connection() -> "duckdb.DuckDBPyConnection":
    global _con
    if _con is None:
        with _lock:
            if _con is None:
                con = duckdb.connect(":memory:")
                # Queries here are small and file-capped (<=200 files, well
                # under a second either way) — not OLAP scans that benefit
                # from parallelism. Six separate processes import this
                # module, so threads=4 each meant 24 DuckDB threads competing
                # with Spark (which grabs all cores by default) and everything
                # else. Confirmed live: this oversubscription contributed to
                # a 24-minute system-wide stall under sustained replay load on
                # a 12-core box. threads=1 removes DuckDB from that contention
                # with no measurable latency cost at this data volume.
                con.execute("SET threads TO 1")
                _con = con
    return _con


def list_files(directory: str, max_files: int = 0) -> list[str]:
    """Flat directory listing, newest first, skipping empty/in-flight files."""
    def _compute():
        if not os.path.exists(directory):
            return []
        now = time.time()
        entries = []
        try:
            for e in os.scandir(directory):
                if not (e.is_file() and e.name.endswith(".parquet")):
                    continue
                try:
                    st = e.stat()
                except OSError:
                    continue
                if st.st_size == 0 or (now - st.st_mtime) < _MIN_FILE_AGE_SEC:
                    continue
                entries.append((e.path, st.st_mtime))
        except Exception:
            return []
        entries.sort(key=lambda x: x[1], reverse=True)
        return [p for p, _ in entries]

    paths = _cached_listing(("flat", directory), _compute)
    return paths[:max_files] if max_files > 0 else paths


def list_partitioned_files(directory: str, max_files_per_partition: int = 0) -> list[str]:
    """Hive-partitioned listing (module/source_id=xxx/*.parquet), newest first per partition."""
    def _compute():
        if not os.path.exists(directory):
            return []
        now = time.time()
        out = []
        try:
            for entry in os.scandir(directory):
                if not (entry.is_dir() and entry.name.startswith("source_id=")):
                    continue
                part_files = []
                try:
                    for f in os.scandir(entry.path):
                        if not (f.is_file() and f.name.endswith(".parquet")):
                            continue
                        try:
                            st = f.stat()
                        except OSError:
                            continue
                        if st.st_size == 0 or (now - st.st_mtime) < _MIN_FILE_AGE_SEC:
                            continue
                        part_files.append((f.path, st.st_mtime))
                except Exception:
                    continue
                part_files.sort(key=lambda x: x[1], reverse=True)
                out.append(part_files)
        except Exception:
            return []
        return out

    per_partition = _cached_listing(("partitioned", directory), _compute)
    out = []
    for part_files in per_partition:
        files = part_files[:max_files_per_partition] if max_files_per_partition > 0 else part_files
        out.extend(p for p, _ in files)
    return out


def compact_flat_dir(
    directory: str,
    min_files_to_compact: int = 3,
    dedup_subset: list[str] | None = None,
    dedup_sort_col: str | None = None,
) -> int:
    """
    Merge all current small parquet files in a flat (non-Delta) directory into
    one new file, then delete the originals. For Gold/Alerts, which write
    plain parquet with no _delta_log, so DeltaTable.optimize.compact() (used
    for Bronze/Silver) doesn't apply.

    Safe under concurrent writers: the file list is snapshotted before any
    read, and only files actually read into the merged output get deleted —
    a file written mid-compaction is simply absent from this pass's snapshot
    and gets picked up whole on the next one, never partially merged or lost.
    Re-merges previously compacted output too (no exclusion by filename), so
    file count converges to ~1 indefinitely regardless of how long the stream
    runs — appropriate here because Gold/Alerts data volume stays tiny (low
    thousands of rows even over a long demo) so re-reading the full cumulative
    history every pass is cheap, unlike Bronze/Silver's raw telemetry volume.

    dedup_subset/dedup_sort_col: for upsert-style data (e.g. Alerts, where the
    same alert_id is rewritten on every status transition since the move off
    DeltaTable's merge()), keep only the row with the max dedup_sort_col per
    dedup_subset group instead of accumulating every historical version.

    Returns the number of files merged (0 if nothing to do).
    """
    if not os.path.exists(directory):
        return 0
    try:
        snapshot = [e.path for e in os.scandir(directory) if e.is_file() and e.name.endswith(".parquet")]
    except Exception:
        return 0
    if len(snapshot) < min_files_to_compact:
        return 0

    dfs = []
    successfully_read = []
    for fp in snapshot:
        try:
            df = pd.read_parquet(fp)
            dfs.append(df)
            successfully_read.append(fp)
        except Exception:
            pass
    if not dfs:
        return 0

    combined = pd.concat(dfs, ignore_index=True)
    if dedup_subset and dedup_sort_col and all(c in combined.columns for c in [*dedup_subset, dedup_sort_col]):
        combined = (
            combined.sort_values(dedup_sort_col)
            .drop_duplicates(subset=dedup_subset, keep="last")
            .reset_index(drop=True)
        )
    out_path = os.path.join(directory, f"_compacted_{int(time.time()*1000)}.parquet")
    try:
        combined.to_parquet(out_path, index=False)
    except Exception:
        return 0

    for fp in successfully_read:
        try:
            os.remove(fp)
        except Exception:
            pass

    return len(successfully_read)


def _pandas_fallback(files: list[str]) -> pd.DataFrame:
    dfs = []
    for fp in files:
        try:
            df = pd.read_parquet(fp)
            if not df.empty:
                dfs.append(df)
        except Exception:
            pass
    return pd.concat(dfs, ignore_index=True) if dfs else pd.DataFrame()


def query_df(sql: str, files: list[str], params: list | None = None, hive_partitioning: bool = False) -> pd.DataFrame:
    """
    Run `sql` against the given parquet files. The SQL must contain exactly
    one `read_parquet(?)` placeholder for the file list — e.g.:

        query_df(
            "SELECT * FROM read_parquet(?) WHERE source_id = ? ORDER BY ts DESC LIMIT 200",
            files, params=["sim001"],
        )

    Falls back to a per-file pandas concat if DuckDB errors on a file that
    slipped past the age/size filter in list_files()/list_partitioned_files().
    Note: the fallback returns the raw concatenated rows — it does not apply
    the rest of the SQL (filter/sort/limit), so callers should treat the
    fallback path as "best effort" and apply any needed filtering themselves
    on the returned DataFrame.
    """
    if not files:
        return pd.DataFrame()

    bound = [files] + (params or [])
    cur = _root_connection().cursor()
    try:
        # union_by_name: Bronze writes with mergeSchema=true, so schema can
        # drift across files over a long stream. Align by column name instead
        # of requiring identical positional schema across every file.
        opts = "hive_partitioning=true, union_by_name=true" if hive_partitioning else "union_by_name=true"
        sql = sql.replace("read_parquet(?)", f"read_parquet(?, {opts})", 1)
        return cur.execute(sql, bound).df()
    except Exception:
        return _pandas_fallback(files)
    finally:
        cur.close()
