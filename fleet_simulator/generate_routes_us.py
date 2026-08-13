"""
One-time script: fetches real road-following geometry for major US interstate
freight corridors from the OSRM demo server and saves as static JSON files.
Mirrors generate_routes.py's approach (origin+destination only, no forced
intermediate waypoints, so OSRM's own routing engine finds the real shortest
path instead of being snapped through manually-approximated via-points).

Usage:  python generate_routes_us.py
Output: routes_us/ directory with one JSON file per route
"""

import json
import os
import time
import urllib.request

ROUTES = {
    "i80_cheyenne_northplatte": {
        "name": "Cheyenne to North Platte (I-80)",
        "origin": "Cheyenne, WY",
        "destination": "North Platte, NE",
        "waypoints": [(41.1400, -104.8202), (41.1239, -100.7654)],
    },
    "i40_albuquerque_amarillo": {
        "name": "Albuquerque to Amarillo (I-40)",
        "origin": "Albuquerque, NM",
        "destination": "Amarillo, TX",
        "waypoints": [(35.0844, -106.6504), (35.2220, -101.8313)],
    },
    "i25_denver_albuquerque": {
        "name": "Denver to Albuquerque (I-25)",
        "origin": "Denver, CO",
        "destination": "Albuquerque, NM",
        "waypoints": [(39.7392, -104.9903), (35.0844, -106.6504)],
    },
    "i10_phoenix_tucson": {
        "name": "Phoenix to Tucson (I-10)",
        "origin": "Phoenix, AZ",
        "destination": "Tucson, AZ",
        "waypoints": [(33.4484, -112.0740), (32.2226, -110.9747)],
    },
    "i95_richmond_fayetteville": {
        "name": "Richmond to Fayetteville (I-95)",
        "origin": "Richmond, VA",
        "destination": "Fayetteville, NC",
        "waypoints": [(37.5407, -77.4360), (35.0527, -78.8784)],
    },
    "i35_dallas_oklahomacity": {
        "name": "Dallas to Oklahoma City (I-35)",
        "origin": "Dallas, TX",
        "destination": "Oklahoma City, OK",
        "waypoints": [(32.7767, -96.7970), (35.4676, -97.5164)],
    },
    "i75_atlanta_chattanooga": {
        "name": "Atlanta to Chattanooga (I-75)",
        "origin": "Atlanta, GA",
        "destination": "Chattanooga, TN",
        "waypoints": [(33.7490, -84.3880), (35.0456, -85.3097)],
    },
    "i70_denver_grandjunction": {
        "name": "Denver to Grand Junction (I-70)",
        "origin": "Denver, CO",
        "destination": "Grand Junction, CO",
        "waypoints": [(39.7392, -104.9903), (39.0639, -108.5506)],
    },
    "i90_chicago_madison": {
        "name": "Chicago to Madison (I-90)",
        "origin": "Chicago, IL",
        "destination": "Madison, WI",
        "waypoints": [(41.8781, -87.6298), (43.0731, -89.4012)],
    },
    "i65_indianapolis_louisville": {
        "name": "Indianapolis to Louisville (I-65)",
        "origin": "Indianapolis, IN",
        "destination": "Louisville, KY",
        "waypoints": [(39.7684, -86.1581), (38.2527, -85.7585)],
    },
    "i20_dallas_shreveport": {
        "name": "Dallas to Shreveport (I-20)",
        "origin": "Dallas, TX",
        "destination": "Shreveport, LA",
        "waypoints": [(32.7767, -96.7970), (32.5252, -93.7502)],
    },
    "i55_stlouis_memphis": {
        "name": "St. Louis to Memphis (I-55)",
        "origin": "St. Louis, MO",
        "destination": "Memphis, TN",
        "waypoints": [(38.6270, -90.1994), (35.1495, -90.0490)],
    },
    "i94_minneapolis_milwaukee": {
        "name": "Minneapolis to Milwaukee (I-94)",
        "origin": "Minneapolis, MN",
        "destination": "Milwaukee, WI",
        "waypoints": [(44.9778, -93.2650), (43.0389, -87.9065)],
    },
    "i81_roanoke_harrisonburg": {
        "name": "Roanoke to Harrisonburg (I-81)",
        "origin": "Roanoke, VA",
        "destination": "Harrisonburg, VA",
        "waypoints": [(37.2710, -79.9414), (38.4496, -78.8689)],
    },
    "i10_houston_sanantonio": {
        "name": "Houston to San Antonio (I-10)",
        "origin": "Houston, TX",
        "destination": "San Antonio, TX",
        "waypoints": [(29.7604, -95.3698), (29.4241, -98.4936)],
    },
    "i5_sacramento_redding": {
        "name": "Sacramento to Redding (I-5)",
        "origin": "Sacramento, CA",
        "destination": "Redding, CA",
        "waypoints": [(38.5816, -121.4944), (40.5865, -122.3917)],
    },
    "i15_lasvegas_barstow": {
        "name": "Las Vegas to Barstow (I-15)",
        "origin": "Las Vegas, NV",
        "destination": "Barstow, CA",
        "waypoints": [(36.1699, -115.1398), (34.8958, -117.0173)],
    },
    "i84_boise_twinfalls": {
        "name": "Boise to Twin Falls (I-84)",
        "origin": "Boise, ID",
        "destination": "Twin Falls, ID",
        "waypoints": [(43.6150, -116.2023), (42.5630, -114.4609)],
    },
    "i30_dallas_texarkana": {
        "name": "Dallas to Texarkana (I-30)",
        "origin": "Dallas, TX",
        "destination": "Texarkana, TX",
        "waypoints": [(32.7767, -96.7970), (33.4418, -94.0377)],
    },
    "i64_charleston_lexington": {
        "name": "Charleston to Lexington (I-64)",
        "origin": "Charleston, WV",
        "destination": "Lexington, KY",
        "waypoints": [(38.3498, -81.6326), (38.0406, -84.5037)],
    },
    "i71_cincinnati_columbus": {
        "name": "Cincinnati to Columbus (I-71)",
        "origin": "Cincinnati, OH",
        "destination": "Columbus, OH",
        "waypoints": [(39.1031, -84.5120), (39.9612, -82.9988)],
    },
    "i45_houston_dallas": {
        "name": "Houston to Dallas (I-45)",
        "origin": "Houston, TX",
        "destination": "Dallas, TX",
        "waypoints": [(29.7604, -95.3698), (32.7767, -96.7970)],
    },
    "i59_birmingham_chattanooga": {
        "name": "Birmingham to Chattanooga (I-59)",
        "origin": "Birmingham, AL",
        "destination": "Chattanooga, TN",
        "waypoints": [(33.5186, -86.8104), (35.0456, -85.3097)],
    },
    "i24_nashville_chattanooga": {
        "name": "Nashville to Chattanooga (I-24)",
        "origin": "Nashville, TN",
        "destination": "Chattanooga, TN",
        "waypoints": [(36.1627, -86.7816), (35.0456, -85.3097)],
    },
    "i44_tulsa_springfield": {
        "name": "Tulsa to Springfield (I-44)",
        "origin": "Tulsa, OK",
        "destination": "Springfield, MO",
        "waypoints": [(36.1540, -95.9928), (37.2090, -93.2923)],
    },
    "i57_chicago_champaign": {
        "name": "Chicago to Champaign (I-57)",
        "origin": "Chicago, IL",
        "destination": "Champaign, IL",
        "waypoints": [(41.8781, -87.6298), (40.1164, -88.2434)],
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
    out_dir = os.path.join(os.path.dirname(__file__), "routes_us")
    os.makedirs(out_dir, exist_ok=True)

    for key, route_def in ROUTES.items():
        print(f"\n{'='*60}")
        print(f"Route: {route_def['name']}")

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
        print(f"  Distance: {dist_km:.1f} km ({dist_km * 0.621371:.1f} mi)")
        print(f"  Duration: {dur_min:.1f} min")
        print(f"  Saved: {out_path}")

        time.sleep(1.5)

    print(f"\n{'='*60}")
    print("All US routes generated.")


if __name__ == "__main__":
    main()
