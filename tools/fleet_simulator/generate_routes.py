"""
One-time script: fetches real road-following geometry from OSRM demo server
and saves as static JSON files. Run once, commit the output, never call again.

Usage:  python generate_routes.py
Output: routes/ directory with one JSON file per route
"""

import json
import os
import time
import urllib.request

ROUTES = {
    "delhi_lucknow": {
        "name": "Delhi to Lucknow (NH-44 / Expressway)",
        "origin": "New Delhi",
        "destination": "Lucknow, UP",
        "waypoints": [
            (28.6139, 77.2090),
            (28.5700, 77.3200),
            (28.4900, 77.5000),
            (28.3500, 77.6800),
            (27.9000, 78.0200),
            (27.1767, 78.0081),
            (27.2100, 78.9500),
            (27.1300, 79.4500),
            (27.0500, 79.9200),
            (26.9200, 80.3500),
            (26.8500, 80.9100),
            (26.8467, 80.9462),
        ],
    },
    "delhi_jaipur": {
        "name": "Delhi to Jaipur (NH-48)",
        "origin": "New Delhi",
        "destination": "Jaipur, Rajasthan",
        "waypoints": [
            (28.6139, 77.2090),
            (28.5500, 77.1000),
            (28.4500, 76.9800),
            (28.4200, 76.8500),
            (28.3200, 76.7200),
            (28.1500, 76.6000),
            (27.8500, 76.4000),
            (27.5500, 76.2500),
            (27.2500, 76.1500),
            (27.0000, 75.9500),
            (26.9124, 75.7873),
        ],
    },
    "delhi_chandigarh": {
        "name": "Delhi to Chandigarh (NH-44)",
        "origin": "New Delhi",
        "destination": "Chandigarh",
        "waypoints": [
            (28.6139, 77.2090),
            (28.7200, 77.1500),
            (28.8500, 77.1000),
            (28.9800, 76.9800),
            (29.1500, 76.8500),
            (29.3500, 76.7800),
            (29.5300, 76.7200),
            (29.7000, 76.7500),
            (29.9500, 76.7800),
            (30.2500, 76.7800),
            (30.5000, 76.7800),
            (30.7333, 76.7794),
        ],
    },
    "delhi_agra": {
        "name": "Delhi to Agra (Yamuna Expressway)",
        "origin": "New Delhi",
        "destination": "Agra, UP",
        "waypoints": [
            (28.6139, 77.2090),
            (28.5400, 77.2800),
            (28.4500, 77.3500),
            (28.3200, 77.4300),
            (28.1500, 77.5000),
            (27.9500, 77.5500),
            (27.7000, 77.5800),
            (27.5000, 77.6000),
            (27.3000, 77.7500),
            (27.1767, 78.0081),
        ],
    },
    "lucknow_varanasi": {
        "name": "Lucknow to Varanasi (NH-31)",
        "origin": "Lucknow, UP",
        "destination": "Varanasi, UP",
        "waypoints": [
            (26.8467, 80.9462),
            (26.8000, 81.1500),
            (26.7500, 81.4000),
            (26.6800, 81.6500),
            (26.5500, 81.9000),
            (26.4500, 82.1500),
            (26.3500, 82.4000),
            (26.2000, 82.7000),
            (26.0500, 82.9500),
            (25.8500, 83.0500),
            (25.5500, 83.0500),
            (25.3176, 82.9739),
        ],
    },
    "jaipur_udaipur": {
        "name": "Jaipur to Udaipur (NH-48)",
        "origin": "Jaipur, Rajasthan",
        "destination": "Udaipur, Rajasthan",
        "waypoints": [
            (26.9124, 75.7873),
            (26.7500, 75.6500),
            (26.5500, 75.5000),
            (26.3500, 75.3500),
            (26.1500, 75.1500),
            (25.9500, 74.9500),
            (25.7500, 74.7500),
            (25.5000, 74.5500),
            (25.2500, 74.3000),
            (25.0000, 74.1000),
            (24.8000, 73.9500),
            (24.5854, 73.7125),
        ],
    },
    "delhi_dehradun": {
        "name": "Delhi to Dehradun (NH-7)",
        "origin": "New Delhi",
        "destination": "Dehradun, Uttarakhand",
        "waypoints": [
            (28.6139, 77.2090),
            (28.7500, 77.2000),
            (28.9000, 77.2500),
            (29.0500, 77.3000),
            (29.2500, 77.3500),
            (29.4500, 77.4500),
            (29.6500, 77.5500),
            (29.8500, 77.7000),
            (29.9500, 77.8500),
            (30.0500, 77.9500),
            (30.2000, 78.0000),
            (30.3165, 78.0322),
        ],
    },
}


def fetch_osrm_route(waypoints):
    coords_str = ";".join(f"{lng},{lat}" for lat, lng in waypoints)
    url = f"http://router.project-osrm.org/route/v1/driving/{coords_str}?overview=full&geometries=geojson&steps=true"

    print(f"  Fetching: {url[:100]}...")
    req = urllib.request.Request(url, headers={"User-Agent": "FleetSimulator/1.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode())

    if data["code"] != "Ok":
        raise RuntimeError(f"OSRM error: {data['code']}")

    route_geom = data["routes"][0]["geometry"]["coordinates"]

    road_types = []
    for leg in data["routes"][0]["legs"]:
        for step in leg["steps"]:
            step_coords = step["geometry"]["coordinates"]
            n = len(step_coords)
            if step["distance"] > 0 and (step["duration"] / max(step["distance"], 1)) < 0.06:
                rtype = "highway"
            elif step["distance"] > 0 and (step["duration"] / max(step["distance"], 1)) > 0.12:
                rtype = "urban"
            else:
                rtype = "primary"
            road_types.extend([rtype] * n)

    while len(road_types) < len(route_geom):
        road_types.append(road_types[-1] if road_types else "highway")
    road_types = road_types[:len(route_geom)]

    total_dist_km = data["routes"][0]["distance"] / 1000.0
    duration_min = data["routes"][0]["duration"] / 60.0

    return route_geom, road_types, total_dist_km, duration_min


def main():
    out_dir = os.path.join(os.path.dirname(__file__), "routes")
    os.makedirs(out_dir, exist_ok=True)

    for key, route_def in ROUTES.items():
        print(f"\n{'='*60}")
        print(f"Route: {route_def['name']}")
        print(f"  Waypoints: {len(route_def['waypoints'])}")

        coords, road_types, dist_km, dur_min = fetch_osrm_route(route_def["waypoints"])

        route_data = {
            "name": route_def["name"],
            "origin": route_def["origin"],
            "destination": route_def["destination"],
            "total_km": round(dist_km, 1),
            "duration_min": round(dur_min, 1),
            "coordinates": [[round(c[1], 6), round(c[0], 6)] for c in coords],
            "road_types": road_types,
        }

        out_path = os.path.join(out_dir, f"{key}.json")
        with open(out_path, "w") as f:
            json.dump(route_data, f)

        print(f"  Points: {len(coords)}")
        print(f"  Distance: {dist_km:.1f} km")
        print(f"  Duration: {dur_min:.1f} min")
        print(f"  Saved: {out_path}")

        time.sleep(1.5)

    print(f"\n{'='*60}")
    print("All routes generated.")


if __name__ == "__main__":
    main()
