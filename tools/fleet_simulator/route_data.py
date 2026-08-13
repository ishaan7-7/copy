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
    "highway": 82.0,
    "primary": 60.0,
    "urban": 22.0,
}

ROUTES_DIR = os.path.join(os.path.dirname(__file__), "routes")
US_ROUTES_DIR = os.path.join(os.path.dirname(__file__), "routes_us")

ROUTE_KEYS = [
    "delhi_lucknow",
    "delhi_jaipur",
    "delhi_chandigarh",
    "delhi_agra",
    "lucknow_varanasi",
    "jaipur_udaipur",
    "delhi_dehradun",
    "mumbai_pune",
    "hyderabad_warangal",
    "kolkata_durgapur",
    "bangalore_mysore",
    "chennai_vellore",
    "ahmedabad_vadodara",
    "pune_nashik",
    "bhopal_indore",
]

US_ROUTE_KEYS = [
    "i80_cheyenne_northplatte",
    "i40_albuquerque_amarillo",
    "i25_denver_albuquerque",
    "i10_phoenix_tucson",
    "i95_richmond_fayetteville",
    "i35_dallas_oklahomacity",
    "i75_atlanta_chattanooga",
    "i70_denver_grandjunction",
    "i90_chicago_madison",
    "i65_indianapolis_louisville",
    "i20_dallas_shreveport",
    "i55_stlouis_memphis",
    "i94_minneapolis_milwaukee",
    "i81_roanoke_harrisonburg",
    "i10_houston_sanantonio",
    "i5_sacramento_redding",
    "i15_lasvegas_barstow",
    "i84_boise_twinfalls",
    "i30_dallas_texarkana",
    "i64_charleston_lexington",
    "i71_cincinnati_columbus",
    "i45_houston_dallas",
    "i59_birmingham_chattanooga",
    "i24_nashville_chattanooga",
    "i44_tulsa_springfield",
    "i57_chicago_champaign",
]


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371.0
    rlat1, rlng1, rlat2, rlng2 = map(math.radians, [lat1, lng1, lat2, lng2])
    dlat = rlat2 - rlat1
    dlng = rlng2 - rlng1
    a = math.sin(dlat / 2) ** 2 + math.cos(rlat1) * math.cos(rlat2) * math.sin(dlng / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))


def load_route(route_key: str, routes_dir: str = ROUTES_DIR) -> DenseRoute:
    path = os.path.join(routes_dir, f"{route_key}.json")
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


def build_all_routes(region: str = "india") -> dict[str, DenseRoute]:
    if region == "america":
        return {key: load_route(key, US_ROUTES_DIR) for key in US_ROUTE_KEYS}
    return {key: load_route(key) for key in ROUTE_KEYS}
