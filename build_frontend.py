"""
Builds the master dashboard frontend and stamps the build with a source
signature so staleness can be detected automatically on every future launch.

Single source of truth for building — used by both run.py (automatic
--if-stale rebuild before serving the static bundle) and
setup_test_device.py (explicit one-time build). Never call `npm run build`
directly from anywhere else; route through this script so the manifest
always stays in sync with what's actually on disk.

Usage:
    python tools/build_frontend.py              # unconditional rebuild
    python tools/build_frontend.py --if-stale    # rebuild only if source
                                                  # changed since last build
                                                  # (or no manifest exists)
"""

import argparse
import json
import os
import subprocess
import sys
import time

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
FRONTEND_DIR = os.path.join(ROOT_DIR, "master_dashboard", "frontend")
DIST_DIR = os.path.join(FRONTEND_DIR, "dist")
MANIFEST_PATH = os.path.join(DIST_DIR, ".build_manifest.json")
NODE_DIR = os.path.join(ROOT_DIR, "tools", "node")
NPM_CACHE = os.path.join(ROOT_DIR, "tools", "npm_cache")

# Any file under these roots (relative to FRONTEND_DIR) participates in the
# build; a change to any of them must invalidate the previous build.
_SIGNATURE_ROOTS = ["src", "index.html", "package.json", "vite.config.ts", "tsconfig.json"]


def frontend_source_mtime() -> float:
    """Latest mtime across everything that feeds the build. 0.0 if nothing found."""
    latest = 0.0
    for rel in _SIGNATURE_ROOTS:
        path = os.path.join(FRONTEND_DIR, rel)
        if os.path.isfile(path):
            latest = max(latest, os.path.getmtime(path))
        elif os.path.isdir(path):
            for dirpath, _dirnames, filenames in os.walk(path):
                for name in filenames:
                    try:
                        mt = os.path.getmtime(os.path.join(dirpath, name))
                    except OSError:
                        continue
                    if mt > latest:
                        latest = mt
    return latest


def dist_build_signature() -> float | None:
    """Source-mtime recorded at the last successful build, or None if unknown
    (no manifest — e.g. a build produced before this tracking existed)."""
    if not os.path.exists(MANIFEST_PATH):
        return None
    try:
        with open(MANIFEST_PATH, encoding="utf-8") as fh:
            data = json.load(fh)
        return float(data["source_mtime"])
    except (OSError, json.JSONDecodeError, KeyError, ValueError, TypeError):
        return None


def is_stale() -> bool:
    if not os.path.exists(os.path.join(DIST_DIR, "index.html")):
        return True
    recorded = dist_build_signature()
    if recorded is None:
        return True
    return frontend_source_mtime() > recorded


def _write_manifest(source_mtime: float) -> None:
    os.makedirs(DIST_DIR, exist_ok=True)
    tmp = MANIFEST_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump({
            "source_mtime": source_mtime,
            "built_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        }, fh, indent=2)
    os.replace(tmp, MANIFEST_PATH)


def build() -> bool:
    """Runs `npm run build`, then stamps the manifest. Returns success."""
    node_exe = os.path.join(NODE_DIR, "node.exe")
    npm_cmd = os.path.join(NODE_DIR, "npm.cmd")
    if not os.path.exists(node_exe):
        print(f"ERROR: Node.js not found at {NODE_DIR}. Run setup.bat first.")
        return False

    env = os.environ.copy()
    env["PATH"] = NODE_DIR + os.pathsep + env.get("PATH", "")
    env["npm_config_cache"] = NPM_CACHE

    node_modules = os.path.join(FRONTEND_DIR, "node_modules")
    if not os.path.exists(node_modules):
        print("node_modules not found — running npm install (this takes ~1 min on first run)...")
        result = subprocess.run(f'"{npm_cmd}" install --legacy-peer-deps',
                                shell=True, cwd=FRONTEND_DIR, env=env)
        if result.returncode != 0:
            print("ERROR: npm install failed.")
            return False

    # Snapshot the source signature BEFORE building — if a file changes mid-build
    # that change won't be reflected in this build anyway, and stamping the
    # pre-build signature is always a safe (or conservatively stale) record.
    signature = frontend_source_mtime()

    print("Building frontend (npm run build)...")
    result = subprocess.run(f'"{npm_cmd}" run build', shell=True, cwd=FRONTEND_DIR, env=env)
    if result.returncode != 0:
        print("ERROR: frontend build failed — see output above.")
        return False

    _write_manifest(signature)
    print(f"Build complete. Manifest stamped at {MANIFEST_PATH}")
    return True


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--if-stale", action="store_true", dest="if_stale",
                       help="Only rebuild if source changed since the last build")
    args = parser.parse_args()

    if args.if_stale and not is_stale():
        print("Frontend build is up to date — skipping rebuild.")
        sys.exit(0)

    if args.if_stale:
        print("Frontend build is stale (source changed since last build) — rebuilding...")

    sys.exit(0 if build() else 1)


if __name__ == "__main__":
    main()
