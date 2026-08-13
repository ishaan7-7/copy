"""
One-time script: fetches real road-following geometry from OSRM demo server
and saves as static JSON files. Run once, commit the output, never call again.

Usage:  python generate_routes.py
Output: routes/ directory with one JSON file per route

Only origin+destination are passed to OSRM (no forced intermediate
waypoints) so its own routing engine picks the actual shortest real path
instead of being snapped through manually-approximated via-points that can
land on minor local roads and inflate the distance.
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
            (26.8467, 80.9462),
        ],
    },
    "delhi_jaipur": {
        "name": "Delhi to Jaipur (NH-48)",
        "origin": "New Delhi",
        "destination": "Jaipur, Rajasthan",
        "waypoints": [
            (28.6139, 77.2090),
            (26.9124, 75.7873),
        ],
    },
    "delhi_chandigarh": {
        "name": "Delhi to Chandigarh (NH-44)",
        "origin": "New Delhi",
        "destination": "Chandigarh",
        "waypoints": [
            (28.6139, 77.2090),
            (30.7333, 76.7794),
        ],
    },
    "delhi_agra": {
        "name": "Delhi to Agra (Yamuna Expressway)",
        "origin": "New Delhi",
        "destination": "Agra, UP",
        "waypoints": [
            (28.6139, 77.2090),
            (27.1767, 78.0081),
        ],
    },
    "lucknow_varanasi": {
        "name": "Lucknow to Varanasi (NH-31)",
        "origin": "Lucknow, UP",
        "destination": "Varanasi, UP",
        "waypoints": [
            (26.8467, 80.9462),
            (25.3176, 82.9739),
        ],
    },
    "jaipur_udaipur": {
        "name": "Jaipur to Udaipur (NH-48)",
        "origin": "Jaipur, Rajasthan",
        "destination": "Udaipur, Rajasthan",
        "waypoints": [
            (26.9124, 75.7873),
            (24.5854, 73.7125),
        ],
    },
    "delhi_dehradun": {
        "name": "Delhi to Dehradun (NH-7)",
        "origin": "New Delhi",
        "destination": "Dehradun, Uttarakhand",
        "waypoints": [
            (28.6139, 77.2090),
            (30.3165, 78.0322),
        ],
    },
    "mumbai_pune": {
        "name": "Mumbai to Pune (Mumbai-Pune Expressway NH-48)",
        "origin": "Mumbai, Maharashtra",
        "destination": "Pune, Maharashtra",
        "waypoints": [
            (19.0760, 72.8777),
            (18.5204, 73.8567),
        ],
    },
    "hyderabad_warangal": {
        "name": "Hyderabad to Warangal (NH-163)",
        "origin": "Hyderabad, Telangana",
        "destination": "Warangal, Telangana",
        "waypoints": [
            (17.3850, 78.4867),
            (17.9784, 79.5941),
        ],
    },
    "kolkata_durgapur": {
        "name": "Kolkata to Durgapur (NH-19 Grand Trunk Road)",
        "origin": "Kolkata, West Bengal",
        "destination": "Durgapur, West Bengal",
        "waypoints": [
            (22.5726, 88.3639),
            (23.5204, 87.3119),
        ],
    },
    "bangalore_mysore": {
        "name": "Bangalore to Mysore (NH-275)",
        "origin": "Bangalore, Karnataka",
        "destination": "Mysore, Karnataka",
        "waypoints": [
            (12.9716, 77.5946),
            (12.2958, 76.6394),
        ],
    },
    "chennai_vellore": {
        "name": "Chennai to Vellore (NH-48)",
        "origin": "Chennai, Tamil Nadu",
        "destination": "Vellore, Tamil Nadu",
        "waypoints": [
            (13.0827, 80.2707),
            (12.9165, 79.1325),
        ],
    },
    "ahmedabad_vadodara": {
        "name": "Ahmedabad to Vadodara (NH-48)",
        "origin": "Ahmedabad, Gujarat",
        "destination": "Vadodara, Gujarat",
        "waypoints": [
            (23.0225, 72.5714),
            (22.3072, 73.1812),
        ],
    },
    "pune_nashik": {
        "name": "Pune to Nashik (NH-60)",
        "origin": "Pune, Maharashtra",
        "destination": "Nashik, Maharashtra",
        "waypoints": [
            (18.5204, 73.8567),
            (19.9975, 73.7898),
        ],
    },
    "bhopal_indore": {
        "name": "Bhopal to Indore (NH-46)",
        "origin": "Bhopal, Madhya Pradesh",
        "destination": "Indore, Madhya Pradesh",
        "waypoints": [
            (23.2599, 77.4126),
            (22.7196, 75.8577),
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
