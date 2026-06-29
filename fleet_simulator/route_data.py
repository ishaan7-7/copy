import json
import math
import os
from dataclasses import dataclass, field


@dataclass
class RoutePoint:
    lat: float
    lng: float
    road_type: str
    speed_target_kmh: float
    cumulative_km: float


@dataclass
class DenseRoute:
    name: str
    origin: str
    destination: str
    points: list[RoutePoint] = field(default_factory=list)
    total_km: float = 0.0


SPEED_BY_ROAD = {
    "highway": 105.0,
    "primary": 68.0,
    "urban": 36.0,
}

ROUTES_DIR = os.path.join(os.path.dirname(__file__), "routes")

ROUTE_KEYS = [
    "delhi_lucknow",
    "delhi_jaipur",
    "delhi_chandigarh",
    "delhi_agra",
    "lucknow_varanasi",
    "jaipur_udaipur",
    "delhi_dehradun",
]


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371.0
    rlat1, rlng1, rlat2, rlng2 = map(math.radians, [lat1, lng1, lat2, lng2])
    dlat = rlat2 - rlat1
    dlng = rlng2 - rlng1
    a = math.sin(dlat / 2) ** 2 + math.cos(rlat1) * math.cos(rlat2) * math.sin(dlng / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))


def load_route(route_key: str) -> DenseRoute:
    path = os.path.join(ROUTES_DIR, f"{route_key}.json")
    with open(path, "r") as f:
        data = json.load(f)

    coords = data["coordinates"]
    road_types = data["road_types"]

    route = DenseRoute(
        name=data["name"],
        origin=data["origin"],
        destination=data["destination"],
        total_km=data["total_km"],
    )

    cum_km = 0.0
    prev_lat, prev_lng = coords[0]

    for i, (lat, lng) in enumerate(coords):
        if i > 0:
            cum_km += _haversine_km(prev_lat, prev_lng, lat, lng)
            prev_lat, prev_lng = lat, lng

        rt = road_types[i] if i < len(road_types) else "highway"
        speed = SPEED_BY_ROAD.get(rt, 80.0)

        route.points.append(RoutePoint(
            lat=lat,
            lng=lng,
            road_type=rt,
            speed_target_kmh=speed,
            cumulative_km=round(cum_km, 4),
        ))

    return route


def build_all_routes() -> dict[str, DenseRoute]:
    return {key: load_route(key) for key in ROUTE_KEYS}
