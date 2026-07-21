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
    "mumbai_pune": {
        "name": "Mumbai to Pune (Mumbai-Pune Expressway NH-48)",
        "origin": "Mumbai, Maharashtra",
        "destination": "Pune, Maharashtra",
        "waypoints": [
            (19.0760, 72.8777),
            (19.1136, 72.9091),
            (19.2183, 72.9781),
            (19.2403, 73.1302),
            (19.1536, 73.2038),
            (18.9750, 73.2940),
            (18.8540, 73.3710),
            (18.7480, 73.4068),
            (18.6560, 73.5290),
            (18.5820, 73.6840),
            (18.5204, 73.8567),
        ],
    },
    "hyderabad_warangal": {
        "name": "Hyderabad to Warangal (NH-163)",
        "origin": "Hyderabad, Telangana",
        "destination": "Warangal, Telangana",
        "waypoints": [
            (17.3850, 78.4867),
            (17.4150, 78.5600),
            (17.4480, 78.6560),
            (17.4780, 78.7620),
            (17.5077, 78.9113),
            (17.5470, 79.0250),
            (17.6120, 79.1000),
            (17.7230, 79.1532),
            (17.8350, 79.3210),
            (17.9120, 79.4580),
            (17.9784, 79.5941),
        ],
    },
    "kolkata_durgapur": {
        "name": "Kolkata to Durgapur (NH-19 Grand Trunk Road)",
        "origin": "Kolkata, West Bengal",
        "destination": "Durgapur, West Bengal",
        "waypoints": [
            (22.5726, 88.3639),
            (22.5958, 88.2636),
            (22.6370, 88.1560),
            (22.7050, 88.0540),
            (22.8290, 87.9420),
            (22.9720, 87.8650),
            (23.0980, 87.8010),
            (23.2324, 87.8615),
            (23.3750, 87.6490),
            (23.4810, 87.4580),
            (23.5204, 87.3119),
        ],
    },
    "bangalore_mysore": {
        "name": "Bangalore to Mysore (NH-275)",
        "origin": "Bangalore, Karnataka",
        "destination": "Mysore, Karnataka",
        "waypoints": [
            (12.9716, 77.5946),
            (12.9080, 77.5020),
            (12.8290, 77.4020),
            (12.7286, 77.2865),
            (12.6580, 77.1750),
            (12.6040, 77.0920),
            (12.5580, 76.9840),
            (12.5226, 76.8956),
            (12.4580, 76.8010),
            (12.3710, 76.7200),
            (12.2958, 76.6394),
        ],
    },
    "chennai_vellore": {
        "name": "Chennai to Vellore (NH-48)",
        "origin": "Chennai, Tamil Nadu",
        "destination": "Vellore, Tamil Nadu",
        "waypoints": [
            (13.0827, 80.2707),
            (12.9890, 80.1750),
            (12.9100, 80.0560),
            (12.8342, 79.7036),
            (12.8650, 79.5420),
            (12.9050, 79.4270),
            (12.9232, 79.3324),
            (12.9165, 79.2140),
            (12.9060, 79.1580),
            (12.9165, 79.1325),
        ],
    },
    "ahmedabad_vadodara": {
        "name": "Ahmedabad to Vadodara (NH-48)",
        "origin": "Ahmedabad, Gujarat",
        "destination": "Vadodara, Gujarat",
        "waypoints": [
            (23.0225, 72.5714),
            (22.9580, 72.5980),
            (22.8720, 72.6340),
            (22.7950, 72.6820),
            (22.7060, 72.7380),
            (22.6280, 72.7940),
            (22.5645, 72.9289),
            (22.5010, 72.9840),
            (22.4250, 73.0560),
            (22.3620, 73.1120),
            (22.3072, 73.1812),
        ],
    },
    "pune_nashik": {
        "name": "Pune to Nashik (NH-60)",
        "origin": "Pune, Maharashtra",
        "destination": "Nashik, Maharashtra",
        "waypoints": [
            (18.5204, 73.8567),
            (18.6120, 73.8630),
            (18.7610, 73.8641),
            (18.8640, 73.8940),
            (19.0150, 73.9620),
            (19.1380, 74.0180),
            (19.2570, 74.0780),
            (19.3820, 74.1120),
            (19.5050, 74.1720),
            (19.6820, 73.9850),
            (19.8450, 73.8920),
            (19.9975, 73.7898),
        ],
    },
    "bhopal_indore": {
        "name": "Bhopal to Indore (NH-46)",
        "origin": "Bhopal, Madhya Pradesh",
        "destination": "Indore, Madhya Pradesh",
        "waypoints": [
            (23.2599, 77.4126),
            (23.2250, 77.3100),
            (23.2007, 77.0842),
            (23.1580, 76.9340),
            (23.0920, 76.8120),
            (23.0240, 76.6840),
            (22.9840, 76.5610),
            (22.9676, 76.0532),
            (22.9040, 75.9680),
            (22.8240, 75.9010),
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
