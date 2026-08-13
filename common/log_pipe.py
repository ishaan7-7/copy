import re
import subprocess
import sys
import threading
from datetime import datetime, timedelta
from pathlib import Path

_TS_FORMAT = "%Y-%m-%d %H:%M:%S"
_TS_PATTERN = re.compile(r"^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]")


def _pump(proc: subprocess.Popen, log_path: Path) -> None:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with open(log_path, "a", encoding="utf-8") as f:
        for line in proc.stdout:
            f.write(f"[{datetime.now().strftime(_TS_FORMAT)}] {line}")
            f.flush()


def timestamped_popen(cmd, *, cwd, env, log_path: Path, stdin=subprocess.DEVNULL, creationflags=0, shell=False) -> subprocess.Popen:
    proc = subprocess.Popen(
        cmd,
        cwd=cwd,
        env=env,
        stdin=stdin,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        encoding="utf-8",
        errors="replace",
        bufsize=1,
        creationflags=creationflags,
        shell=shell,
    )
    thread = threading.Thread(target=_pump, args=(proc, log_path), daemon=True)
    thread.start()
    return proc


def prune_old_logs(logs_dir: Path, max_age_hours: float = 24.0) -> None:
    cutoff = datetime.now() - timedelta(hours=max_age_hours)
    for path in Path(logs_dir).glob("*.log"):
        try:
            lines = path.read_text(encoding="utf-8", errors="replace").splitlines(keepends=True)
        except Exception:
            continue
        kept = []
        for line in lines:
            m = _TS_PATTERN.match(line)
            if m:
                try:
                    if datetime.strptime(m.group(1), _TS_FORMAT) < cutoff:
                        continue
                except ValueError:
                    pass
            kept.append(line)
        if len(kept) != len(lines):
            try:
                path.write_text("".join(kept), encoding="utf-8")
            except Exception:
                pass


def prune_loop(logs_dir: Path, max_age_hours: float = 24.0, interval_seconds: float = 3600.0) -> None:
    import time
    while True:
        prune_old_logs(logs_dir, max_age_hours)
        time.sleep(interval_seconds)


class _TimestampedStream:
    def __init__(self, stream):
        self._stream = stream
        self._at_line_start = True

    def write(self, data: str) -> int:
        if not data:
            return 0
        out = []
        for ch in data:
            if self._at_line_start and ch != "\n":
                out.append(f"[{datetime.now().strftime(_TS_FORMAT)}] ")
                self._at_line_start = False
            out.append(ch)
            if ch == "\n":
                self._at_line_start = True
        return self._stream.write("".join(out))

    def flush(self) -> None:
        self._stream.flush()

    def __getattr__(self, name):
        return getattr(self._stream, name)


def install_timestamped_stdout() -> None:
    sys.stdout = _TimestampedStream(sys.stdout)
    sys.stderr = _TimestampedStream(sys.stderr)
