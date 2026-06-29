"""
Centralized parquet file listing cache.
Replaces os.walk() + sort-by-mtime across all services.

Usage:
    from parquet_cache import list_parquets
    files = list_parquets("data/delta/bronze/engine")           # latest first, cached 3s
    files = list_parquets("data/delta/silver/engine", max_files=5)
"""

import os
import time
from threading import Lock

_cache: dict[str, tuple[float, list[str]]] = {}
_lock = Lock()
_TTL = 3.0


def list_parquets(directory: str, max_files: int = 0) -> list[str]:
    now = time.monotonic()

    with _lock:
        entry = _cache.get(directory)
        if entry and (now - entry[0]) < _TTL:
            files = entry[1]
            return files[:max_files] if max_files > 0 else files

    if not os.path.exists(directory):
        with _lock:
            _cache[directory] = (now, [])
        return []

    all_files = []
    try:
        for direntry in os.scandir(directory):
            if direntry.is_file() and direntry.name.endswith(".parquet"):
                all_files.append((direntry.path, direntry.stat().st_mtime))
            elif direntry.is_dir() and not direntry.name.startswith("_"):
                try:
                    for sub in os.scandir(direntry.path):
                        if sub.is_file() and sub.name.endswith(".parquet"):
                            all_files.append((sub.path, sub.stat().st_mtime))
                except Exception:
                    pass
    except Exception:
        pass

    all_files.sort(key=lambda x: x[1], reverse=True)
    sorted_paths = [f[0] for f in all_files]

    with _lock:
        _cache[directory] = (now, sorted_paths)

    return sorted_paths[:max_files] if max_files > 0 else sorted_paths


def get_latest_mtime(directory: str) -> float:
    files = list_parquets(directory, max_files=1)
    if not files:
        return 0.0
    try:
        return os.path.getmtime(files[0])
    except Exception:
        return 0.0


def clear_cache():
    with _lock:
        _cache.clear()
