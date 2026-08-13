import asyncio
import json
import socket
import subprocess
import sys
from pathlib import Path

from fastapi import APIRouter, HTTPException

ROOT_DIR         = Path(__file__).resolve().parents[2]
VENV_PYTHON      = ROOT_DIR / ".venv" / "Scripts" / "python.exe"
if not VENV_PYTHON.exists():
    VENV_PYTHON = Path(sys.executable)

RUN_CONTROLLER   = ROOT_DIR / "run_controller.py"
RUN_PY           = ROOT_DIR / "run.py"
CONFIG_PATH      = ROOT_DIR / "replay" / "config" / "replay_config.json"
PID_FILE         = ROOT_DIR / ".replay.pid"
HARD_RESET_LOG   = ROOT_DIR / "logs" / "hard_reset_from_dashboard.log"

HARD_RESET_PORTS = [8000, 8001, 8002, 8003, 8004, 8006, 8007, 8009]

router = APIRouter()


async def _to_thread(func, *args, **kwargs):
    return await asyncio.to_thread(func, *args, **kwargs)


def _run_controller(*flags: str, timeout: int = 30) -> subprocess.CompletedProcess:
    return subprocess.run(
        [str(VENV_PYTHON), str(RUN_CONTROLLER), *flags],
        cwd=str(ROOT_DIR),
        capture_output=True,
        text=True,
        timeout=timeout,
    )


def _pid_alive(pid: int) -> bool:
    try:
        result = subprocess.run(
            ["tasklist", "/FI", f"PID eq {pid}"],
            capture_output=True, text=True, timeout=5,
        )
        return str(pid) in result.stdout
    except Exception:
        return False


def _replay_probe() -> tuple[bool, int | None]:
    if not PID_FILE.exists():
        return False, None
    try:
        pid = int(PID_FILE.read_text().strip())
        if _pid_alive(pid):
            return True, pid
    except Exception:
        pass
    return False, None


def _port_listening(port: int) -> bool:
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=0.2):
            return True
    except OSError:
        return False


@router.get("/api/replay/status")
async def replay_status():
    running, pid = _replay_probe()
    cfg: dict = {}
    try:
        cfg = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except Exception:
        pass
    return {
        "running": running,
        "pid": pid,
        "rows_per_second": cfg.get("rows_per_second"),
        "replay_mode": cfg.get("replay_mode"),
        "enabled_sims": cfg.get("enabled_sims", []),
    }


@router.post("/api/replay/start")
async def replay_start():
    result = await _to_thread(_run_controller, "--start")
    if result.returncode != 0:
        raise HTTPException(status_code=409, detail=(result.stdout + result.stderr).strip())
    return {"ok": True, "message": result.stdout.strip()}


@router.post("/api/replay/start-with-reset")
async def replay_start_with_reset():
    result = await _to_thread(_run_controller, "--start", "--with-reset")
    if result.returncode != 0:
        raise HTTPException(status_code=409, detail=(result.stdout + result.stderr).strip())
    return {"ok": True, "message": result.stdout.strip()}


@router.post("/api/replay/stop")
async def replay_stop():
    result = await _to_thread(_run_controller, "--stop")
    if result.returncode != 0:
        raise HTTPException(status_code=409, detail=(result.stdout + result.stderr).strip())
    return {"ok": True, "message": result.stdout.strip()}


@router.post("/api/replay/reset")
async def replay_reset():
    result = await _to_thread(_run_controller, "--reset")
    if result.returncode != 0:
        raise HTTPException(status_code=409, detail=(result.stdout + result.stderr).strip())
    return {"ok": True, "message": result.stdout.strip()}


_hard_reset_proc: subprocess.Popen | None = None


@router.post("/api/system/hard-reset")
async def start_hard_reset():
    global _hard_reset_proc
    if _hard_reset_proc is not None and _hard_reset_proc.poll() is None:
        raise HTTPException(status_code=409, detail="A hard reset is already in progress.")

    HARD_RESET_LOG.parent.mkdir(parents=True, exist_ok=True)
    log_fh = open(HARD_RESET_LOG, "a", encoding="utf-8")

    _hard_reset_proc = subprocess.Popen(
        [str(VENV_PYTHON), str(RUN_PY), "--reset", "--keep-dashboard", "--skip-preflight"],
        cwd=str(ROOT_DIR),
        stdout=log_fh,
        stderr=subprocess.STDOUT,
        stdin=subprocess.DEVNULL,
    )
    return {"ok": True, "message": "Hard reset started.", "pid": _hard_reset_proc.pid}


@router.get("/api/system/hard-reset/status")
async def hard_reset_status():
    in_progress = _hard_reset_proc is not None and _hard_reset_proc.poll() is None
    services_up = 0
    for port in HARD_RESET_PORTS:
        if await _to_thread(_port_listening, port):
            services_up += 1

    return {
        "in_progress": in_progress,
        "services_up": services_up,
        "services_total": len(HARD_RESET_PORTS),
    }
