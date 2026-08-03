import json as _json
import pathlib as _pl

_manifest = _json.loads(
    (_pl.Path(__file__).resolve().parents[2] / "config" / "fleet_manifest.json").read_text()
)
_STATUS_MAP: dict = {}
for _s in _manifest["active_sims"]:
    _STATUS_MAP[_s] = "active"
for _s in _manifest["in_service_sims"]:
    _STATUS_MAP[_s] = "in_service"
for _s in _manifest["parked_sims"]:
    _STATUS_MAP[_s] = "parked"


VEHICLES = [
    {"id": "sim001", "name": "sim001", "type": "Truck", "status": "active", "route": "delhi_lucknow", "route_us": "i80_cheyenne_northplatte",      "driver": "R. Sharma", "driver_us": "J. Miller",     "health": 96.2, "composite": 0.038, "module_health": {"engine": 93.7, "transmission": 95.7, "battery": 99.7, "body": 100.0, "tyre": 96.7}},
    {"id": "sim002", "name": "sim002", "type": "Truck", "status": "active", "route": "delhi_lucknow", "route_us": "i40_albuquerque_amarillo",      "driver": "A. Patel", "driver_us": "R. Thompson",      "health": 93.1, "composite": 0.069, "module_health": {"engine": 90.6, "transmission": 92.6, "battery": 96.6, "body": 99.6, "tyre": 93.6}},
    {"id": "sim003", "name": "sim003", "type": "Truck", "status": "active", "route": "mumbai_pune", "route_us": "i25_denver_albuquerque",        "driver": "V. Singh", "driver_us": "M. Anderson",      "health": 90.4, "composite": 0.096, "module_health": {"engine": 87.9, "transmission": 89.9, "battery": 93.9, "body": 96.9, "tyre": 90.9}},
    {"id": "sim004", "name": "sim004", "type": "Truck", "status": "active", "route": "mumbai_pune", "route_us": "i10_phoenix_tucson",        "driver": "S. Gupta", "driver_us": "K. Wilson",      "health": 87.8, "composite": 0.122, "module_health": {"engine": 85.3, "transmission": 87.3, "battery": 91.3, "body": 94.3, "tyre": 88.3}},
    {"id": "sim005", "name": "sim005", "type": "Truck", "status": "active", "route": "bhopal_indore", "route_us": "i95_richmond_fayetteville",      "driver": "K. Verma", "driver_us": "D. Martinez",      "health": 84.5, "composite": 0.155, "module_health": {"engine": 76.5, "transmission": 81.0, "battery": 93.5, "body": 97.5, "tyre": 83.0}},
    {"id": "sim006", "name": "sim006", "type": "Truck", "status": "in_service", "lat": 18.5204, "lng": 73.8567, "city": "Pune, Maharashtra",        "route": "mumbai_pune", "route_us": "i35_dallas_oklahomacity",         "driver": "C. Das", "driver_us": "C. Johnson",       "health": 54.3, "composite": 0.457, "module_health": {"engine": 41.3, "transmission": 46.8, "battery": 70.3, "body": 77.3, "tyre": 48.8}},
    {"id": "sim007", "name": "sim007", "type": "Truck", "status": "active", "route": "delhi_jaipur", "route_us": "i75_atlanta_chattanooga",       "driver": "M. Kumar", "driver_us": "S. Williams",      "health": 94.7, "composite": 0.053, "module_health": {"engine": 92.2, "transmission": 94.2, "battery": 98.2, "body": 100.0, "tyre": 95.2}},
    {"id": "sim008", "name": "sim008", "type": "Truck", "status": "active", "route": "delhi_jaipur", "route_us": "i70_denver_grandjunction",       "driver": "D. Yadav", "driver_us": "B. Davis",      "health": 91.9, "composite": 0.081, "module_health": {"engine": 89.4, "transmission": 91.4, "battery": 95.4, "body": 98.4, "tyre": 92.4}},
    {"id": "sim009", "name": "sim009", "type": "Truck", "status": "active", "route": "hyderabad_warangal", "route_us": "i90_chicago_madison", "driver": "P. Agarwal", "driver_us": "A. Brown",    "health": 88.2, "composite": 0.118, "module_health": {"engine": 85.7, "transmission": 87.7, "battery": 91.7, "body": 94.7, "tyre": 88.7}},
    {"id": "sim010", "name": "sim010", "type": "Truck", "status": "active", "route": "hyderabad_warangal", "route_us": "i65_indianapolis_louisville", "driver": "L. Desai", "driver_us": "T. Garcia",      "health": 82.6, "composite": 0.174, "module_health": {"engine": 74.6, "transmission": 79.1, "battery": 91.6, "body": 95.6, "tyre": 81.1}},
    {"id": "sim011", "name": "sim011", "type": "Truck", "status": "active", "route": "hyderabad_warangal", "route_us": "i20_dallas_shreveport", "driver": "R. Negi", "driver_us": "L. Rodriguez",      "health": 43.7, "composite": 0.563, "module_health": {"engine": 30.7, "transmission": 36.2, "battery": 59.7, "body": 66.7, "tyre": 38.2}},
    {"id": "sim012", "name": "sim012", "type": "Truck", "status": "active", "route": "delhi_chandigarh", "route_us": "i55_stlouis_memphis",   "driver": "T. Joshi", "driver_us": "N. Clark",      "health": 89.3, "composite": 0.107, "module_health": {"engine": 86.8, "transmission": 88.8, "battery": 92.8, "body": 95.8, "tyre": 89.8}},
    {"id": "sim013", "name": "sim013", "type": "Truck", "status": "active", "route": "delhi_chandigarh", "route_us": "i94_minneapolis_milwaukee",   "driver": "N. Mishra", "driver_us": "E. Lewis",     "health": 83.7, "composite": 0.163, "module_health": {"engine": 75.7, "transmission": 80.2, "battery": 92.7, "body": 96.7, "tyre": 82.2}},
    {"id": "sim014", "name": "sim014", "type": "Truck", "status": "active", "route": "kolkata_durgapur", "route_us": "i81_roanoke_harrisonburg",   "driver": "B. Kaur", "driver_us": "G. Walker",       "health": 79.4, "composite": 0.206, "module_health": {"engine": 71.4, "transmission": 75.9, "battery": 88.4, "body": 92.4, "tyre": 77.9}},
    {"id": "sim015", "name": "sim015", "type": "Truck", "status": "active", "route": "kolkata_durgapur", "route_us": "i10_houston_sanantonio",   "driver": "E. Khan", "driver_us": "P. Hall",       "health": 76.8, "composite": 0.232, "module_health": {"engine": 68.8, "transmission": 73.3, "battery": 85.8, "body": 89.8, "tyre": 75.3}},
    {"id": "sim016", "name": "sim016", "type": "Truck", "status": "active", "route": "delhi_agra", "route_us": "i5_sacramento_redding",         "driver": "W. Tripathi", "driver_us": "W. Young",   "health": 95.5, "composite": 0.045, "module_health": {"engine": 93.0, "transmission": 95.0, "battery": 99.0, "body": 100.0, "tyre": 96.0}},
    {"id": "sim017", "name": "sim017", "type": "Truck", "status": "in_service", "lat": 23.5204, "lng": 87.3119, "city": "Durgapur, West Bengal",    "route": "kolkata_durgapur", "route_us": "i15_lasvegas_barstow",    "driver": "K. Jain", "driver_us": "H. King",      "health": 49.8, "composite": 0.502, "module_health": {"engine": 36.8, "transmission": 42.3, "battery": 65.8, "body": 72.8, "tyre": 44.3}},
    {"id": "sim018", "name": "sim018", "type": "Truck", "status": "active", "route": "delhi_agra", "route_us": "i84_boise_twinfalls",         "driver": "H. Rawat", "driver_us": "F. Wright",      "health": 91.7, "composite": 0.083, "module_health": {"engine": 89.2, "transmission": 91.2, "battery": 95.2, "body": 98.2, "tyre": 92.2}},
    {"id": "sim019", "name": "sim019", "type": "Truck", "status": "active", "route": "bangalore_mysore", "route_us": "i30_dallas_texarkana",   "driver": "F. Meena", "driver_us": "O. Scott",      "health": 85.9, "composite": 0.141, "module_health": {"engine": 77.9, "transmission": 82.4, "battery": 94.9, "body": 98.9, "tyre": 84.4}},
    {"id": "sim020", "name": "sim020", "type": "Truck", "status": "active", "route": "bangalore_mysore", "route_us": "i64_charleston_lexington",   "driver": "G. Hegde", "driver_us": "Q. Green",      "health": 78.3, "composite": 0.217, "module_health": {"engine": 70.3, "transmission": 74.8, "battery": 87.3, "body": 91.3, "tyre": 76.8}},
    {"id": "sim021", "name": "sim021", "type": "Truck", "status": "active", "route": "lucknow_varanasi", "route_us": "i71_cincinnati_columbus",   "driver": "I. Rajan", "driver_us": "I. Adams",      "health": 87.4, "composite": 0.126, "module_health": {"engine": 84.9, "transmission": 86.9, "battery": 90.9, "body": 93.9, "tyre": 87.9}},
    {"id": "sim022", "name": "sim022", "type": "Truck", "status": "in_service", "lat": 12.2958, "lng": 76.6394, "city": "Mysore, Karnataka",        "route": "bangalore_mysore", "route_us": "i45_houston_dallas",    "driver": "A. Shukla", "driver_us": "U. Baker",    "health": 37.2, "composite": 0.628, "module_health": {"engine": 24.2, "transmission": 29.7, "battery": 53.2, "body": 60.2, "tyre": 31.7}},
    {"id": "sim023", "name": "sim023", "type": "Truck", "status": "active", "route": "lucknow_varanasi", "route_us": "i59_birmingham_chattanooga",   "driver": "O. Mehta", "driver_us": "Y. Nelson",      "health": 81.2, "composite": 0.188, "module_health": {"engine": 73.2, "transmission": 77.7, "battery": 90.2, "body": 94.2, "tyre": 79.7}},
    {"id": "sim024", "name": "sim024", "type": "Truck", "status": "active", "route": "chennai_vellore", "route_us": "i24_nashville_chattanooga",    "driver": "U. Shah", "driver_us": "X. Carter",       "health": 73.6, "composite": 0.264, "module_health": {"engine": 65.6, "transmission": 70.1, "battery": 82.6, "body": 86.6, "tyre": 72.1}},
    {"id": "sim025", "name": "sim025", "type": "Truck", "status": "active", "route": "jaipur_udaipur", "route_us": "i44_tulsa_springfield",     "driver": "Y. Kulkarni", "driver_us": "Z. Mitchell",   "health": 86.1, "composite": 0.139, "module_health": {"engine": 78.1, "transmission": 82.6, "battery": 95.1, "body": 99.1, "tyre": 84.6}},
    {"id": "sim026", "name": "sim026", "type": "Truck", "status": "in_service", "lat": 12.9165, "lng": 79.1325, "city": "Vellore, Tamil Nadu",      "route": "chennai_vellore", "route_us": "i57_chicago_champaign",     "driver": "D. Chauhan", "driver_us": "V. Perez",   "health": 34.6, "composite": 0.654, "module_health": {"engine": 21.6, "transmission": 27.1, "battery": 50.6, "body": 57.6, "tyre": 29.1}},
    {"id": "sim027", "name": "sim027", "type": "Truck", "status": "active", "route": "jaipur_udaipur", "route_us": "i80_cheyenne_northplatte",     "driver": "Q. Ahmad", "driver_us": "J. Turner",      "health": 71.9, "composite": 0.281, "module_health": {"engine": 63.9, "transmission": 68.4, "battery": 80.9, "body": 84.9, "tyre": 70.4}},
    {"id": "sim028", "name": "sim028", "type": "Truck", "status": "active", "route": "ahmedabad_vadodara", "route_us": "i40_albuquerque_amarillo", "driver": "Z. Tiwari", "driver_us": "R. Phillips",     "health": 64.5, "composite": 0.355, "module_health": {"engine": 51.5, "transmission": 57.0, "battery": 80.5, "body": 87.5, "tyre": 59.0}},
    {"id": "sim029", "name": "sim029", "type": "Truck", "status": "active", "route": "delhi_dehradun", "route_us": "i25_denver_albuquerque",     "driver": "X. Pandey", "driver_us": "M. Campbell",     "health": 93.8, "composite": 0.062, "module_health": {"engine": 91.3, "transmission": 93.3, "battery": 97.3, "body": 100.0, "tyre": 94.3}},
    {"id": "sim030", "name": "sim030", "type": "Truck", "status": "active", "route": "pune_nashik", "route_us": "i10_phoenix_tucson",        "driver": "J. Srivastava", "driver_us": "K. Parker", "health": 80.7, "composite": 0.193, "module_health": {"engine": 72.7, "transmission": 77.2, "battery": 89.7, "body": 93.7, "tyre": 79.2}},
    {"id": "sim031", "name": "sim031", "type": "Truck", "status": "active", "route": "ahmedabad_vadodara", "route_us": "i95_richmond_fayetteville", "driver": "L. Prasad", "driver_us": "D. Evans",    "health": 57.1, "composite": 0.429, "module_health": {"engine": 44.1, "transmission": 49.6, "battery": 73.1, "body": 80.1, "tyre": 51.6}},
    {"id": "sim032", "name": "sim032", "type": "Truck", "status": "active", "route": "delhi_lucknow", "route_us": "i35_dallas_oklahomacity",      "driver": "T. Choudhary", "driver_us": "C. Edwards", "health": 94.6, "composite": 0.054, "module_health": {"engine": 92.3, "transmission": 93.8, "battery": 96.4, "body": 97.1, "tyre": 91.7}},
    {"id": "sim033", "name": "sim033", "type": "Truck", "status": "active", "route": "delhi_jaipur", "route_us": "i75_atlanta_chattanooga",       "driver": "N. Malik", "driver_us": "N. Collins",     "health": 77.5, "composite": 0.225, "module_health": {"engine": 73.2, "transmission": 75.8, "battery": 82.4, "body": 85.3, "tyre": 71.6}},
    {"id": "sim034", "name": "sim034", "type": "Truck", "status": "in_service", "lat": 19.9975, "lng": 73.7898, "city": "Nashik, Maharashtra",      "route": "pune_nashik", "route_us": "i70_denver_grandjunction",         "driver": "P. Bisht", "driver_us": "P. Stewart",     "health": 51.4, "composite": 0.486, "module_health": {"engine": 38.4, "transmission": 43.9, "battery": 67.4, "body": 74.4, "tyre": 45.9}},
    {"id": "sim035", "name": "sim035", "type": "Truck", "status": "active", "route": "delhi_lucknow", "route_us": "i90_chicago_madison",      "driver": "B. Joshi", "driver_us": "B. Sanchez",     "health": 87.9, "composite": 0.121, "module_health": {"engine": 84.3, "transmission": 86.7, "battery": 91.2, "body": 93.5, "tyre": 83.1}},
    {"id": "sim036", "name": "sim036", "type": "Truck", "status": "parked",     "lat": 30.7333, "lng": 76.7794, "city": "Chandigarh",               "route": "delhi_chandigarh", "route_us": "i65_indianapolis_louisville",    "driver": "E. Ansari", "driver_us": "E. Morris",    "health": 83.2, "composite": 0.168, "module_health": {"engine": 79.4, "transmission": 81.6, "battery": 87.3, "body": 89.7, "tyre": 77.8}},
    {"id": "sim037", "name": "sim037", "type": "Truck", "status": "in_service", "lat": 22.7196, "lng": 75.8577, "city": "Indore, Madhya Pradesh",   "route": "bhopal_indore", "route_us": "i20_dallas_shreveport",       "driver": "C. Thakur", "driver_us": "C. Rogers",    "health": 40.9, "composite": 0.591, "module_health": {"engine": 27.9, "transmission": 33.4, "battery": 56.9, "body": 63.9, "tyre": 35.4}},
    {"id": "sim038", "name": "sim038", "type": "Truck", "status": "parked",     "lat": 27.1767, "lng": 78.0081, "city": "Agra, UP",                 "route": "delhi_agra", "route_us": "i55_stlouis_memphis",          "driver": "S. Negi", "driver_us": "S. Reed",      "health": 75.8, "composite": 0.242, "module_health": {"engine": 71.3, "transmission": 73.9, "battery": 80.6, "body": 83.2, "tyre": 69.8}},
    {"id": "sim039", "name": "sim039", "type": "Truck", "status": "active", "route": "lucknow_varanasi", "route_us": "i94_minneapolis_milwaukee",   "driver": "V. Taneja", "driver_us": "V. Cook",    "health": 81.7, "composite": 0.183, "module_health": {"engine": 77.9, "transmission": 80.4, "battery": 86.1, "body": 88.4, "tyre": 76.2}},
    {"id": "sim040", "name": "sim040", "type": "Truck", "status": "parked",     "lat": 30.3165, "lng": 78.0322, "city": "Dehradun, Uttarakhand",    "route": "delhi_dehradun", "route_us": "i81_roanoke_harrisonburg",      "driver": "M. Saxena", "driver_us": "M. Bell",    "health": 72.3, "composite": 0.277, "module_health": {"engine": 68.1, "transmission": 70.7, "battery": 76.9, "body": 79.5, "tyre": 66.4}},
]


for _v in VEHICLES:
    if _v["id"] in _STATUS_MAP:
        _v["status"] = _STATUS_MAP[_v["id"]]


def get_severity(health):
    if health >= 80:
        return "normal"
    if health >= 60:
        return "warning"
    return "critical"


def get_maintenance_forecast() -> dict:
    within_1_week = 0
    weeks_1_2 = 0
    weeks_3_4 = 0
    over_1_month = 0
    for v in VEHICLES:
        h = v["health"]
        if h < 40:
            within_1_week += 1
        elif h < 50:
            weeks_1_2 += 1
        elif h < 80:
            weeks_3_4 += 1
        else:
            over_1_month += 1
    return {
        "within_1_week": within_1_week,
        "weeks_1_2": weeks_1_2,
        "weeks_3_4": weeks_3_4,
        "over_1_month": over_1_month,
    }


def get_fleet_summary():
    total = len(VEHICLES)
    active = sum(1 for v in VEHICLES if v["status"] == "active")
    in_service = sum(1 for v in VEHICLES if v["status"] == "in_service")
    parked = sum(1 for v in VEHICLES if v["status"] == "parked")

    severities = {"normal": 0, "warning": 0, "critical": 0}
    health_sum = 0.0
    for v in VEHICLES:
        severities[get_severity(v["health"])] += 1
        health_sum += v["health"]

    return {
        "total": total,
        "active": active,
        "in_service": in_service,
        "parked": parked,
        "avg_health": round(health_sum / total, 1),
        "severity_counts": severities,
    }
