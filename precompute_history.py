"""
Precomputes trip/event/DTC history for all 40 vehicles using route geometry.

Produces per-vehicle JSON layers at:
    data/computed/{sim_id}/trips.json
    data/computed/{sim_id}/events.json
    data/computed/{sim_id}/dtcs.json
    data/computed/{sim_id}/alerts.json
    data/computed/{sim_id}/driver_summary.json
    data/computed/{sim_id}/last_state.json   (non-active vehicles only)

Usage:
    python precompute_history.py --computed-root <path> [--data-root <ignored>] [--yes]
"""

import argparse
import json
import os
import sys
import uuid

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "fleet_simulator"))
from fleet_config import VEHICLES  # noqa: E402
from route_data import load_route, DenseRoute  # noqa: E402

MODULES = ["engine", "transmission", "battery", "body", "tyre"]

P_BRAKE = 2.2
P_ACCEL = 1.4
P_CORNER = 2.2
SCORE_NORM = 33.0

_BRAKE_PER_KM  = {"highway": 0.030, "primary": 0.055, "urban": 0.090}
_ACCEL_PER_KM  = {"highway": 0.022, "primary": 0.040, "urban": 0.065}
_CORNER_PER_KM = {"highway": 0.018, "primary": 0.035, "urban": 0.060}
_MAX_EVENTS_PER_TYPE = 20
_MIN_EVENTS_PER_TYPE = 2

_DTC_POOL: dict[str, list[tuple]] = {
    "engine": [
        ("P0217", "critical",     "Thermal",     "Engine Coolant Over Temperature",            "CRITICAL: Engine coolant temperature exceeding safe limits. Immediate risk of seizure."),
        ("P0420", "critical",     "Emissions",   "Catalyst System Efficiency Below Threshold", "Catalytic converter efficiency failure detected. Emission compliance risk."),
        ("P0171", "critical",     "Fuel System", "System Too Lean (Bank 1)",                   "Engine running too lean. Risk of detonation or hesitation."),
        ("P0300", "critical",     "Ignition",    "Random/Multiple Cylinder Misfire Detected",  "Misfire detected. Engine vibration and power loss likely."),
        ("P0128", "non_critical", "Thermal",     "Coolant Thermostat (Below Regulating Temp)", "Engine taking too long to reach operating temp. Check thermostat."),
        ("P0299", "non_critical", "Performance", "Turbocharger Underboost Condition",          "Turbo boost lower than expected. Possible minor leak or wastegate issue."),
        ("P0562", "non_critical", "Electrical",  "System Voltage Low",                         "Low voltage detected at ECU. Check alternator or battery connections."),
    ],
    "battery": [
        ("P0A80", "critical",     "HV Battery",  "Replace Hybrid Battery Pack (SOH Failure)",   "HV Battery Health critical. Replacement recommended immediately."),
        ("P0A1F", "critical",     "Thermal",     "Battery Energy Control Module (Thermal Risk)", "Battery thermal management failure. Risk of thermal runaway."),
        ("P0562", "critical",     "12V System",  "System Voltage Low (12V Battery Failure)",    "Auxiliary 12V system failure. Vehicle may not start."),
        ("P0A7F", "critical",     "HV Battery",  "Hybrid Battery Pack Deterioration",           "Internal resistance high. Power delivery severely limited."),
        ("P0A94", "non_critical", "Charging",    "DC/DC Converter Performance (Charging Eff)",  "Charging efficiency below optimal. Energy loss detected."),
        ("P0A7D", "non_critical", "HV Battery",  "Hybrid Battery State of Charge Low",          "State of Charge dangerously low. Range anxiety warning."),
        ("P1429", "non_critical", "Regen",       "Regenerative Braking System Performance",     "Regen braking recovering less energy than expected."),
    ],
    "transmission": [
        ("P0894", "critical",     "Mechanical",  "Transmission Component Slipping",              "Severe transmission slip detected. Power loss imminent."),
        ("P0730", "critical",     "Mechanical",  "Incorrect Gear Ratio",                         "Gear ratio mismatch. Mechanical failure or shift solenoid stuck."),
        ("P0218", "critical",     "Hydraulic",   "Transmission Fluid Over Temperature",          "Trans fluid overheating. Stop vehicle to prevent permanent damage."),
        ("P0741", "critical",     "Mechanical",  "Torque Converter Clutch Circuit Perf/Stuck Off","TCC stuck off. Reduced fuel economy and higher transmission temps."),
        ("P2711", "non_critical", "Performance", "Unexpected Mechanical Gear Disengagement",     "Gear popped out of engagement. Check shift linkage."),
        ("P0219", "non_critical", "Performance", "Engine Overspeed Condition (Downshift Error)",  "Engine RPM exceeded limit during downshift."),
    ],
    "tyre": [
        ("C0077", "critical",     "Tire Pressure", "Low Tire Pressure (Severe/Blowout Risk)",   "CRITICAL: Tire pressure dangerously low. Blowout risk."),
        ("C0031", "critical",     "Speed Sensor",  "Left Front Wheel Speed Sensor Circuit",      "FL Speed sensor signal lost. ABS/Traction disabled."),
        ("C0082", "critical",     "Braking",       "Brake System / Stopping Distance Failure",   "Stopping distance abnormal relative to brake pressure."),
        ("C0514", "non_critical", "Tire Health",   "Tire Temperature High (Overheating)",        "Tire running hot. Check load and pressure."),
        ("C0078", "non_critical", "Tire Health",   "Tire Diameter Mismatch (Severe Wear)",       "Tire wear uneven. Diameter mismatch detected."),
        ("C1000", "non_critical", "Suspension",    "Suspension Damper Performance",              "Damper efficiency low. Ride comfort reduced."),
    ],
    "body": [
        ("P0460", "critical",     "Fuel System",   "Fuel Level Sensor 'A' Circuit",              "Fuel level sensor stuck. Signal flatlined."),
        ("B1081", "critical",     "Environmental", "Ambient Air Temperature Sensor Circuit",     "Ambient temp sensor failure. HVAC performance impacted."),
        ("B1058", "critical",     "HVAC",          "Blower Motor Control Circuit",               "Blower motor not responding to command."),
        ("P0533", "critical",     "HVAC",          "A/C Refrigerant Pressure Sensor High",       "A/C pressure critical high. Compressor disabled."),
        ("B1320", "non_critical", "Comfort",       "Cabin Humidity Sensor",                      "Cabin humidity sensor range error."),
        ("P0534", "non_critical", "HVAC",          "Air Conditioner Refrigerant Charge Loss",    "Low refrigerant detected. Cooling performance reduced."),
    ],
}


def _driver_score(events: list[dict], total_km: float) -> float:
    braking = sum(1 for e in events if e["type"] == "braking")
    accel = sum(1 for e in events if e["type"] == "accel")
    cornering = sum(1 for e in events if e["type"] == "cornering")
    weighted = braking * P_BRAKE + accel * P_ACCEL + cornering * P_CORNER
    return max(0.0, round(100.0 - (weighted / max(total_km, 0.1)) * SCORE_NORM, 1))


def _select_dtcs(
    vehicle_id: str,
    health: float,
    module_health: dict,
    data_start: pd.Timestamp,
    data_end: pd.Timestamp,
    rng: np.random.Generator,
) -> list[dict]:
    dtcs: list[dict] = []
    span_secs = (data_end - data_start).total_seconds()

    for module in MODULES:
        mod_h = module_health.get(module, health)
        pool = _DTC_POOL.get(module, [])
        critical_pool = [d for d in pool if d[1] == "critical"]
        noncrit_pool = [d for d in pool if d[1] == "non_critical"]

        if mod_h >= 85:
            n_dtcs = 0
        elif mod_h >= 75:
            n_dtcs = 1 if rng.random() < 0.25 else 0
        elif mod_h >= 60:
            n_dtcs = 1
        elif mod_h >= 45:
            n_dtcs = int(rng.integers(1, 3))
        else:
            n_dtcs = 2

        if n_dtcs == 0 or not pool:
            continue

        selected: list[tuple] = []
        if mod_h < 60 and critical_pool:
            selected.append(critical_pool[int(rng.integers(len(critical_pool)))])
        if n_dtcs >= 2 and noncrit_pool:
            selected.append(noncrit_pool[int(rng.integers(len(noncrit_pool)))])
        if not selected:
            fallback = noncrit_pool if mod_h >= 60 else (critical_pool or noncrit_pool)
            if fallback:
                selected.append(fallback[int(rng.integers(len(fallback)))])

        for code, severity, category, desc, msg in selected:
            offset_frac = float(rng.uniform(0.05, 0.60))
            dtc_start = data_start + pd.Timedelta(seconds=offset_frac * span_secs)
            duration_secs = float(rng.uniform(3600.0, min(span_secs * 0.4, 172800.0)))
            dtc_end = dtc_start + pd.Timedelta(seconds=duration_secs)
            if dtc_end > data_end:
                dtc_end = data_end

            dtcs.append({
                "dtc_code": code,
                "module": module,
                "severity": severity,
                "category": category,
                "description": desc,
                "dashboard_message": msg,
                "first_seen_ts": dtc_start.isoformat(),
                "last_seen_ts": dtc_end.isoformat(),
                "occurrence_count": int(rng.integers(1, 9)),
                "status": "CLOSED",
            })

    return dtcs


def _select_alerts(vehicle_id: str, dtcs: list[dict], rng: np.random.Generator) -> list[dict]:
    alerts: list[dict] = []
    for dtc in dtcs:
        if dtc["severity"] != "critical":
            continue
        dtc_start = pd.Timestamp(dtc["first_seen_ts"])
        dtc_end = pd.Timestamp(dtc["last_seen_ts"])
        span = (dtc_end - dtc_start).total_seconds()
        peak_ts = dtc_start + pd.Timedelta(seconds=float(rng.uniform(0.30, 0.75)) * span)
        alerts.append({
            "alert_id": str(uuid.uuid4()),
            "source_id": vehicle_id,
            "module": dtc["module"],
            "status": "CLOSED",
            "alert_start_ts": dtc["first_seen_ts"],
            "alert_end_ts": dtc["last_seen_ts"],
            "peak_anomaly_ts": peak_ts.isoformat(),
            "max_composite_score": round(float(rng.uniform(0.72, 0.97)), 4),
            "top_10_features": json.dumps({}),
            "last_updated_ts": dtc["last_seen_ts"],
        })
    return alerts


def _interpolate_on_route(route_points: list, target_km: float) -> tuple[float, float]:
    if target_km <= route_points[0].cumulative_km:
        return (route_points[0].lat, route_points[0].lng)
    if target_km >= route_points[-1].cumulative_km:
        return (route_points[-1].lat, route_points[-1].lng)
    for i in range(1, len(route_points)):
        if route_points[i].cumulative_km >= target_km:
            p0 = route_points[i - 1]
            p1 = route_points[i]
            span = p1.cumulative_km - p0.cumulative_km
            if span < 1e-9:
                return (p1.lat, p1.lng)
            frac = (target_km - p0.cumulative_km) / span
            return (p0.lat + frac * (p1.lat - p0.lat), p0.lng + frac * (p1.lng - p0.lng))
    return (route_points[-1].lat, route_points[-1].lng)


def _extract_segment(route_points: list, start_km: float, end_km: float, max_pts: int = 200) -> list[tuple]:
    interior = [(p.lat, p.lng) for p in route_points if start_km < p.cumulative_km < end_km]
    start_pt = _interpolate_on_route(route_points, start_km)
    end_pt = _interpolate_on_route(route_points, end_km)
    all_pts = [start_pt] + interior + [end_pt]
    if len(all_pts) > max_pts:
        step = max(1, len(all_pts) // max_pts)
        thinned = all_pts[::step]
        if thinned[-1] != end_pt:
            thinned.append(end_pt)
        return thinned
    return all_pts


def _generate_trip_events(
    vid: str,
    trip_id: str,
    route: DenseRoute,
    seg_start_km: float,
    seg_end_km: float,
    trip_start_ts: pd.Timestamp,
    duration_secs: float,
    dist_km: float,
    rng: np.random.Generator,
) -> list[dict]:
    seg_points = [p for p in route.points if seg_start_km <= p.cumulative_km <= seg_end_km]
    if len(seg_points) < 4:
        seg_points = route.points

    km_by_type: dict[str, float] = {}
    for i in range(1, len(seg_points)):
        rt = seg_points[i].road_type
        km_by_type[rt] = km_by_type.get(rt, 0.0) + (
            seg_points[i].cumulative_km - seg_points[i - 1].cumulative_km
        )

    def _target(per_km_map: dict) -> int:
        total = sum(per_km_map.get(rt, 0.025) * km for rt, km in km_by_type.items())
        raw = int(rng.poisson(max(total, 0.1)))
        return max(_MIN_EVENTS_PER_TYPE, min(raw, _MAX_EVENTS_PER_TYPE))

    n_brake  = _target(_BRAKE_PER_KM)
    n_accel  = _target(_ACCEL_PER_KM)
    n_corner = _target(_CORNER_PER_KM)

    events: list[dict] = []

    for evt_type, n, lo, hi in [
        ("braking",   n_brake,  -0.62, -0.35),
        ("accel",     n_accel,   0.25,  0.55),
        ("cornering", n_corner,  0.27,  0.55),
    ]:
        for _ in range(n):
            pt = seg_points[int(rng.integers(0, len(seg_points)))]
            progress = (pt.cumulative_km - seg_start_km) / max(dist_km, 0.01)
            ts = trip_start_ts + pd.Timedelta(seconds=progress * duration_secs)
            speed = pt.speed_target_kmh * float(rng.uniform(0.80, 1.10))
            acc_g = float(rng.uniform(lo, hi))
            if evt_type == "cornering":
                sign = int(rng.integers(2)) * 2 - 1
                acc_g = sign * abs(acc_g)
            events.append({
                "event_id": "",
                "trip_id": trip_id,
                "timestamp": ts.isoformat(),
                "type": evt_type,
                "severity": "warning" if abs(acc_g) < 0.55 else "critical",
                "speed_kmh": round(float(speed), 1),
                "acc_g": round(float(acc_g), 3),
                "lat": round(pt.lat, 6),
                "lng": round(pt.lng, 6),
                "distance_km": round(pt.cumulative_km - seg_start_km, 2),
            })

    events.sort(key=lambda e: e["timestamp"])
    return events


def _generate_route_based_data(
    vid: str,
    route: DenseRoute,
    rng: np.random.Generator,
    data_end_ts: pd.Timestamp,
) -> tuple[list[dict], list[dict]]:
    N_TRIPS = 5

    raw_segs: list[tuple[float, float]] = []
    for _ in range(N_TRIPS - 1):
        frac = float(rng.uniform(0.35, 0.70))
        seg_km = route.total_km * frac
        max_start = max(0.0, route.total_km - seg_km)
        start_km = float(rng.uniform(0.0, max_start))
        raw_segs.append((start_km, start_km + seg_km))
    raw_segs.append((0.0, route.total_km))

    stamped: list[tuple] = []
    current_end_ts = data_end_ts

    for seg_start_km, seg_end_km in reversed(raw_segs):
        dist_km = seg_end_km - seg_start_km
        pts_in_seg = [p for p in route.points if seg_start_km <= p.cumulative_km <= seg_end_km]
        if pts_in_seg:
            avg_target = sum(p.speed_target_kmh for p in pts_in_seg) / len(pts_in_seg)
        else:
            avg_target = 65.0
        avg_speed = avg_target * float(rng.uniform(0.82, 0.93))
        duration_secs = (dist_km / max(avg_speed, 1.0)) * 3600.0
        max_speed = avg_target * float(rng.uniform(1.05, 1.20))

        seg_end_ts = current_end_ts
        seg_start_ts = seg_end_ts - pd.Timedelta(seconds=duration_secs)
        stamped.append((seg_start_km, seg_end_km, seg_start_ts, seg_end_ts, dist_km, avg_speed, max_speed))

        gap_secs = float(rng.uniform(3600.0, 21600.0))
        current_end_ts = seg_start_ts - pd.Timedelta(seconds=gap_secs)

    stamped.reverse()

    trips_out: list[dict] = []
    all_events: list[dict] = []

    for i, (seg_start_km, seg_end_km, seg_start_ts, seg_end_ts, dist_km, avg_speed, max_speed) in enumerate(stamped):
        trip_id = f"{vid}-trip-{i + 1:03d}"
        duration_secs = (seg_end_ts - seg_start_ts).total_seconds()

        waypoints = _extract_segment(route.points, seg_start_km, seg_end_km)

        trip_events = _generate_trip_events(
            vid, trip_id, route,
            seg_start_km, seg_end_km,
            seg_start_ts, duration_secs, dist_km, rng,
        )
        all_events.extend(trip_events)

        trips_out.append({
            "trip_id": trip_id,
            "start_ts": seg_start_ts.isoformat(),
            "end_ts": seg_end_ts.isoformat(),
            "duration_mins": round(duration_secs / 60.0, 1),
            "distance_km": round(dist_km, 2),
            "avg_speed_kmh": round(avg_speed, 1),
            "max_speed_kmh": round(max_speed, 1),
            "event_count": len(trip_events),
            "harsh_braking_count": sum(1 for e in trip_events if e["type"] == "braking"),
            "harsh_accel_count": sum(1 for e in trip_events if e["type"] == "accel"),
            "harsh_cornering_count": sum(1 for e in trip_events if e["type"] == "cornering"),
            "route_waypoints": [[round(lat, 6), round(lng, 6)] for lat, lng in waypoints],
        })

    for idx, e in enumerate(all_events):
        e["event_id"] = f"{vid}-evt-{idx + 1:04d}"

    return trips_out, all_events


def _process_vehicle(v: dict, computed_root: str) -> None:
    vid = v["id"]
    seed = abs(hash(vid)) % (2 ** 31)
    rng = np.random.default_rng(seed)

    print(f"  {vid}  status={v['status']}  health={v['health']}")

    route_key = v.get("route")
    if not route_key:
        print(f"    SKIP: no route defined")
        return

    data_end_ts = pd.Timestamp("2024-07-14T00:00:00", tz="UTC")
    data_start_ts = data_end_ts - pd.Timedelta(days=30)

    route = load_route(route_key)
    trips_out, events = _generate_route_based_data(vid, route, rng, data_end_ts)

    total_km = sum(t["distance_km"] for t in trips_out)
    total_hours = sum(t["duration_mins"] for t in trips_out) / 60.0
    score = _driver_score(events, total_km)

    module_health = v.get("module_health", {})
    health = v["health"]

    dtcs = _select_dtcs(vid, health, module_health, data_start_ts, data_end_ts, rng)
    alerts = _select_alerts(vid, dtcs, rng)

    braking_n = sum(1 for e in events if e["type"] == "braking")
    accel_n = sum(1 for e in events if e["type"] == "accel")
    corner_n = sum(1 for e in events if e["type"] == "cornering")

    driver_summary = {
        "vehicle_id": vid,
        "driver": v["driver"],
        "score": score,
        "total_trips": len(trips_out),
        "total_km": round(total_km, 2),
        "total_hours": round(total_hours, 2),
        "avg_speed_kmh": round(total_km / max(total_hours, 0.01), 1),
        "harsh_braking_count": braking_n,
        "harsh_accel_count": accel_n,
        "harsh_cornering_count": corner_n,
        "harsh_events_per_100km": round(len(events) / max(total_km, 0.01) * 100, 2),
        "data_start_ts": data_start_ts.isoformat(),
        "data_end_ts": data_end_ts.isoformat(),
    }

    out_dir = os.path.join(computed_root, vid)
    os.makedirs(out_dir, exist_ok=True)

    layers: list[tuple] = [
        ("trips.json", trips_out),
        ("events.json", events),
        ("dtcs.json", dtcs),
        ("alerts.json", alerts),
        ("driver_summary.json", driver_summary),
    ]

    if v["status"] != "active":
        last_state = {
            "vehicle_id": vid,
            "name": vid,
            "type": v.get("type", "Truck"),
            "status": v["status"],
            "lat": v.get("lat", 0.0),
            "lng": v.get("lng", 0.0),
            "city": v.get("city", ""),
            "speed_kmh": 0.0,
            "heading": 0.0,
            "health": health,
            "composite_score": v.get("composite", round(1.0 - health / 100.0, 3)),
            "module_health": module_health,
            "driver": v["driver"],
            "driver_score": score,
            "last_data_ts": data_end_ts.isoformat(),
            "road_type": "",
            "route_name": v.get("city", ""),
            "engine_health": round(module_health.get("engine", health), 1),
        }
        layers.append(("last_state.json", last_state))

    for filename, payload in layers:
        with open(os.path.join(out_dir, filename), "w", encoding="utf-8") as fh:
            json.dump(payload, fh, indent=2, default=str)

    print(f"    trips={len(trips_out)}  events={len(events)}  dtcs={len(dtcs)}  alerts={len(alerts)}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Precompute history for all vehicles")
    parser.add_argument("--computed-root", required=True, help="Output root for computed JSON layers")
    parser.add_argument("--data-root", default="", help="(unused) Legacy CSV data root")
    parser.add_argument("--yes", action="store_true", help="Skip confirmation prompt")
    args = parser.parse_args()

    computed_root = os.path.abspath(args.computed_root)

    print(f"\nComputed root: {computed_root}")
    print(f"Vehicles     : {len(VEHICLES)} total\n")

    if not args.yes:
        ans = input("Proceed? [y/N] ").strip().lower()
        if ans != "y":
            print("Aborted.")
            sys.exit(0)
        print()

    for v in VEHICLES:
        _process_vehicle(v, computed_root)

    print(f"\nDone. Output written to: {computed_root}")


if __name__ == "__main__":
    main()
