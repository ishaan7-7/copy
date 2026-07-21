import io
import json
import os
import tarfile
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NODE_MODULES = os.path.join(ROOT, "master_dashboard", "frontend", "node_modules")

PACKAGES = [
    ("leaflet", "1.9.4"),
    ("react-leaflet", "4.2.1"),
    ("@types/leaflet", "1.9.12"),
    ("@react-leaflet/core", "2.1.0"),
]


def download_and_extract(package_name: str, version: str):
    if package_name.startswith("@"):
        scope, name = package_name.split("/", 1)
        url = f"https://registry.npmjs.org/{scope}/{name}/-/{name}-{version}.tgz"
        dest = os.path.join(NODE_MODULES, scope, name)
    else:
        url = f"https://registry.npmjs.org/{package_name}/-/{package_name}-{version}.tgz"
        dest = os.path.join(NODE_MODULES, package_name)

    if os.path.exists(dest) and os.path.isdir(dest):
        print(f"  {package_name}@{version} — already exists, skipping")
        return

    print(f"  {package_name}@{version} — downloading from {url}")
    req = urllib.request.Request(url, headers={"User-Agent": "Python/install_leaflet"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = resp.read()

    os.makedirs(dest, exist_ok=True)

    with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as tar:
        for member in tar.getmembers():
            if not member.name.startswith("package/"):
                continue
            member.name = member.name[len("package/"):]
            if not member.name:
                continue
            tar.extract(member, dest)

    print(f"  {package_name}@{version} — installed to {dest}")


def main():
    print(f"Installing leaflet packages to {NODE_MODULES}\n")

    if not os.path.exists(NODE_MODULES):
        print(f"ERROR: {NODE_MODULES} does not exist. Run npm install first for other deps.")
        return

    for name, version in PACKAGES:
        try:
            download_and_extract(name, version)
        except Exception as e:
            print(f"  ERROR installing {name}@{version}: {e}")

    print("\nDone. Restart the Vite dev server.")


if __name__ == "__main__":
    main()