VEHICLES = [
    {"id": "sim_001", "name": "sim_001", "type": "Truck",  "status": "active", "route": "delhi_lucknow",     "driver": "R. Sharma",    "health": 91.2, "composite": 0.088, "module_health": {"engine": 88.5, "transmission": 92.1, "battery": 94.0, "body": 97.2, "tyre": 93.8}},
    {"id": "sim_002", "name": "sim_002", "type": "Sedan",  "status": "active", "route": "delhi_jaipur",      "driver": "A. Patel",     "health": 84.7, "composite": 0.153, "module_health": {"engine": 79.3, "transmission": 86.4, "battery": 91.2, "body": 95.8, "tyre": 88.1}},
    {"id": "sim_003", "name": "sim_003", "type": "Van",    "status": "active", "route": "delhi_chandigarh",   "driver": "V. Singh",     "health": 73.1, "composite": 0.269, "module_health": {"engine": 64.2, "transmission": 71.8, "battery": 82.5, "body": 90.1, "tyre": 76.4}},
    {"id": "sim_007", "name": "sim_007", "type": "Truck",  "status": "active", "route": "delhi_agra",         "driver": "S. Gupta",     "health": 95.4, "composite": 0.046, "module_health": {"engine": 96.1, "transmission": 94.8, "battery": 97.2, "body": 98.5, "tyre": 95.0}},
    {"id": "sim_008", "name": "sim_008", "type": "Sedan",  "status": "active", "route": "lucknow_varanasi",   "driver": "K. Verma",     "health": 62.8, "composite": 0.372, "module_health": {"engine": 52.1, "transmission": 58.9, "battery": 71.4, "body": 85.2, "tyre": 67.3}},
    {"id": "sim_009", "name": "sim_009", "type": "Van",    "status": "active", "route": "jaipur_udaipur",     "driver": "M. Kumar",     "health": 88.3, "composite": 0.117, "module_health": {"engine": 85.7, "transmission": 89.2, "battery": 92.8, "body": 96.4, "tyre": 90.1}},
    {"id": "sim_010", "name": "sim_010", "type": "Truck",  "status": "active", "route": "delhi_dehradun",     "driver": "D. Yadav",     "health": 79.6, "composite": 0.204, "module_health": {"engine": 72.8, "transmission": 78.5, "battery": 85.1, "body": 92.7, "tyre": 80.3}},

    {"id": "sim_004", "name": "sim_004", "type": "Truck",  "status": "in_service", "lat": 19.0760, "lng": 72.8777, "city": "Mumbai, Maharashtra",     "driver": "L. Desai",     "health": 45.2, "composite": 0.548, "module_health": {"engine": 38.1, "transmission": 42.5, "battery": 55.8, "body": 62.3, "tyre": 48.7}},
    {"id": "sim_005", "name": "sim_005", "type": "Van",    "status": "in_service", "lat": 17.3850, "lng": 78.4867, "city": "Hyderabad, Telangana",    "driver": "P. Reddy",     "health": 38.7, "composite": 0.613, "module_health": {"engine": 31.4, "transmission": 35.8, "battery": 48.2, "body": 56.1, "tyre": 41.9}},
    {"id": "sim_006", "name": "sim_006", "type": "Sedan",  "status": "in_service", "lat": 22.5726, "lng": 88.3639, "city": "Kolkata, West Bengal",    "driver": "C. Das",       "health": 51.3, "composite": 0.487, "module_health": {"engine": 44.6, "transmission": 49.2, "battery": 60.1, "body": 68.7, "tyre": 53.4}},

    {"id": "sim_011", "name": "sim_011", "type": "Sedan",  "status": "parked", "lat": 28.6139, "lng": 77.2090, "city": "New Delhi",              "driver": "T. Agarwal",   "health": 94.1, "composite": 0.059},
    {"id": "sim_012", "name": "sim_012", "type": "Truck",  "status": "parked", "lat": 26.9124, "lng": 75.7873, "city": "Jaipur, Rajasthan",       "driver": "N. Joshi",     "health": 97.3, "composite": 0.027},
    {"id": "sim_013", "name": "sim_013", "type": "Van",    "status": "parked", "lat": 26.8467, "lng": 80.9462, "city": "Lucknow, UP",             "driver": "B. Mishra",    "health": 92.5, "composite": 0.075},
    {"id": "sim_014", "name": "sim_014", "type": "Truck",  "status": "parked", "lat": 30.7333, "lng": 76.7794, "city": "Chandigarh",              "driver": "E. Kaur",      "health": 89.8, "composite": 0.102},
    {"id": "sim_015", "name": "sim_015", "type": "Sedan",  "status": "parked", "lat": 27.1767, "lng": 78.0081, "city": "Agra, UP",                "driver": "W. Khan",      "health": 96.0, "composite": 0.040},
    {"id": "sim_016", "name": "sim_016", "type": "Van",    "status": "parked", "lat": 25.3176, "lng": 82.9739, "city": "Varanasi, UP",            "driver": "H. Tripathi",  "health": 91.4, "composite": 0.086},
    {"id": "sim_017", "name": "sim_017", "type": "Truck",  "status": "parked", "lat": 30.3165, "lng": 78.0322, "city": "Dehradun, Uttarakhand",   "driver": "F. Rawat",     "health": 88.2, "composite": 0.118},
    {"id": "sim_018", "name": "sim_018", "type": "Sedan",  "status": "parked", "lat": 24.5854, "lng": 73.7125, "city": "Udaipur, Rajasthan",      "driver": "G. Meena",     "health": 93.7, "composite": 0.063},
    {"id": "sim_019", "name": "sim_019", "type": "Van",    "status": "parked", "lat": 12.9716, "lng": 77.5946, "city": "Bangalore, Karnataka",    "driver": "I. Hegde",     "health": 95.8, "composite": 0.042},
    {"id": "sim_020", "name": "sim_020", "type": "Truck",  "status": "parked", "lat": 13.0827, "lng": 80.2707, "city": "Chennai, Tamil Nadu",     "driver": "O. Rajan",     "health": 90.3, "composite": 0.097},
    {"id": "sim_021", "name": "sim_021", "type": "Sedan",  "status": "parked", "lat": 23.0225, "lng": 72.5714, "city": "Ahmedabad, Gujarat",      "driver": "U. Mehta",     "health": 87.6, "composite": 0.124},
    {"id": "sim_022", "name": "sim_022", "type": "Van",    "status": "parked", "lat": 21.1702, "lng": 72.8311, "city": "Surat, Gujarat",           "driver": "Y. Shah",      "health": 94.9, "composite": 0.051},
    {"id": "sim_023", "name": "sim_023", "type": "Truck",  "status": "parked", "lat": 18.5204, "lng": 73.8567, "city": "Pune, Maharashtra",        "driver": "Q. Kulkarni",  "health": 91.1, "composite": 0.089},
    {"id": "sim_024", "name": "sim_024", "type": "Sedan",  "status": "parked", "lat": 26.4499, "lng": 80.3319, "city": "Kanpur, UP",              "driver": "Z. Ahmad",     "health": 96.5, "composite": 0.035},
    {"id": "sim_025", "name": "sim_025", "type": "Van",    "status": "parked", "lat": 26.8500, "lng": 80.9100, "city": "Lucknow Depot 2, UP",     "driver": "X. Pandey",    "health": 93.2, "composite": 0.068},

    {"id": "sim_026", "name": "sim_026", "type": "Truck",  "status": "parked", "lat": 28.4595, "lng": 77.0266, "city": "Gurgaon, Haryana",        "driver": "V. Taneja",    "health": 72.4, "composite": 0.276},
    {"id": "sim_027", "name": "sim_027", "type": "Sedan",  "status": "parked", "lat": 28.5355, "lng": 77.3910, "city": "Noida, UP",               "driver": "M. Saxena",    "health": 68.1, "composite": 0.319},
    {"id": "sim_028", "name": "sim_028", "type": "Van",    "status": "parked", "lat": 28.6692, "lng": 77.4538, "city": "Ghaziabad, UP",           "driver": "R. Tiwari",    "health": 74.9, "composite": 0.251},

    {"id": "sim_029", "name": "sim_029", "type": "Truck",  "status": "parked", "lat": 25.4358, "lng": 81.8463, "city": "Prayagraj, UP",           "driver": "J. Srivastava","health": 42.3, "composite": 0.577},
    {"id": "sim_030", "name": "sim_030", "type": "Sedan",  "status": "parked", "lat": 29.9457, "lng": 78.1642, "city": "Haridwar, Uttarakhand",   "driver": "S. Negi",      "health": 38.9, "composite": 0.611},

    {"id": "sim_031", "name": "sim_031", "type": "Van",    "status": "parked", "lat": 22.7196, "lng": 75.8577, "city": "Indore, MP",              "driver": "K. Jain",      "health": 92.0, "composite": 0.080},
    {"id": "sim_032", "name": "sim_032", "type": "Truck",  "status": "parked", "lat": 23.2599, "lng": 77.4126, "city": "Bhopal, MP",              "driver": "A. Shukla",    "health": 95.1, "composite": 0.049},
    {"id": "sim_033", "name": "sim_033", "type": "Sedan",  "status": "parked", "lat": 26.2006, "lng": 78.1792, "city": "Gwalior, MP",             "driver": "D. Chauhan",   "health": 89.4, "composite": 0.106},
    {"id": "sim_034", "name": "sim_034", "type": "Van",    "status": "parked", "lat": 25.6093, "lng": 85.1376, "city": "Patna, Bihar",            "driver": "L. Prasad",    "health": 93.8, "composite": 0.062},
    {"id": "sim_035", "name": "sim_035", "type": "Truck",  "status": "parked", "lat": 29.3803, "lng": 79.4636, "city": "Haldwani, Uttarakhand",   "driver": "P. Bisht",     "health": 90.7, "composite": 0.093},
    {"id": "sim_036", "name": "sim_036", "type": "Sedan",  "status": "parked", "lat": 31.1048, "lng": 77.1734, "city": "Shimla, HP",              "driver": "C. Thakur",    "health": 96.2, "composite": 0.038},
    {"id": "sim_037", "name": "sim_037", "type": "Van",    "status": "parked", "lat": 26.9260, "lng": 75.7200, "city": "Jaipur Depot 2, Rajasthan","driver": "T. Choudhary", "health": 88.9, "composite": 0.111},
    {"id": "sim_038", "name": "sim_038", "type": "Truck",  "status": "parked", "lat": 28.9845, "lng": 77.7064, "city": "Meerut, UP",              "driver": "N. Malik",     "health": 94.5, "composite": 0.055},
    {"id": "sim_039", "name": "sim_039", "type": "Sedan",  "status": "parked", "lat": 29.2183, "lng": 79.5130, "city": "Nainital, Uttarakhand",   "driver": "B. Joshi",     "health": 91.6, "composite": 0.084},
    {"id": "sim_040", "name": "sim_040", "type": "Van",    "status": "parked", "lat": 27.8974, "lng": 78.0880, "city": "Aligarh, UP",             "driver": "E. Ansari",    "health": 90.0, "composite": 0.100},
]


def get_severity(health):
    if health >= 80:
        return "normal"
    if health >= 60:
        return "warning"
    return "critical"


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
