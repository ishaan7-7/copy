"""
Precomputes historical data layers for non-active vehicles (sim026-sim040).

Reads expanded CSV sensor data and produces per-vehicle JSON layers at:
    data/computed/{sim_id}/trips.json
    data/computed/{sim_id}/events.json
    data/computed/{sim_id}/dtcs.json
    data/computed/{sim_id}/alerts.json
    data/computed/{sim_id}/driver_summary.json
    data/computed/{sim_id}/last_state.json

Usage:
    python precompute_history.py --data-root <path> --computed-root <path> [--yes]
"""

import argparse
import glob as _glob
import json
import os
import sys
import uuid

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "fleet_simulator"))
from fleet_config import VEHICLES  # noqa: E402
from route_data import load_route  # noqa: E402

MODULES = ["engine", "transmission", "battery", "body", "tyre"]
GAP_THRESHOLD_SECS = 300
MIN_TRIP_SECS = 120
MIN_TRIP_KM = 0.5

P_BRAKE = 2.2
P_ACCEL = 1.4
P_CORNER = 2.2
SCORE_NORM = 33.0

HARSH_BRAKE_G = -0.35
HARSH_ACCEL_G = 0.25
MAX_ACC_DT_SECS = 30.0
CORNER_INJECT_PROB = 0.0008

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


def _find_csv(root: str, sim_id: str, module: str) -> str | None:
    pattern = os.path.join(root, sim_id, f"*{module}*scenarioA*{sim_id}*.csv")
    matches = _glob.glob(pattern)
    if matches:
        return matches[0]
    pattern2 = os.path.join(root, sim_id, f"*{module}*.csv")
    matches2 = _glob.glob(pattern2)
    return matches2[0] if matches2 else None


def _load_speed_series(data_root: str, sim_id: str) -> pd.DataFrame | None:
    path = _find_csv(data_root, sim_id, "transmission")
    if path is None:
        return None
    try:
        df = pd.read_csv(path, low_memory=False)
    except Exception:
        return None
    if "timestamp" not in df.columns or "vehicle_speed_kmh" not in df.columns:
        return None
    df["_ts"] = pd.to_datetime(df["timestamp"], format="mixed", utc=True)
    df = df.sort_values("_ts").reset_index(drop=True)
    df["_speed"] = pd.to_numeric(df["vehicle_speed_kmh"], errors="coerce").fillna(0.0).clip(lower=0.0)
    return df[["_ts", "_speed"]].copy()


def _detect_trips(speed_df: pd.DataFrame) -> list[dict]:
    ts = speed_df["_ts"].values
    speeds = speed_df["_speed"].values

    dt_secs = np.diff(ts.astype("int64")) / 1e9

    break_indices = np.where(dt_secs > GAP_THRESHOLD_SECS)[0] + 1
    seg_starts = np.concatenate([[0], break_indices])
    seg_ends = np.concatenate([break_indices, [len(ts)]])

    trips: list[dict] = []
    for seg_s, seg_e in zip(seg_starts, seg_ends):
        seg_ts = ts[seg_s:seg_e]
        seg_speed = speeds[seg_s:seg_e]

        if len(seg_ts) < 2:
            continue

        duration_secs = float((seg_ts[-1] - seg_ts[0]).astype("timedelta64[s]").astype(np.float64))
        if duration_secs < MIN_TRIP_SECS:
            continue

        seg_dt = np.diff(seg_ts.astype("int64")) / 1e9
        avg_pair = (seg_speed[:-1] + seg_speed[1:]) / 2.0
        dt_capped = np.minimum(seg_dt, GAP_THRESHOLD_SECS)
        dist_km = float(np.sum(avg_pair * dt_capped / 3600.0))

        if dist_km < MIN_TRIP_KM:
            continue

        moving = seg_speed > 2.0
        avg_speed = float(np.mean(seg_speed[moving])) if moving.any() else 0.0
        max_speed = float(np.max(seg_speed))

        trips.append({
            "_seg_s": int(seg_s),
            "_seg_e": int(seg_e),
            "start_ts": pd.Timestamp(seg_ts[0]).isoformat(),
            "end_ts": pd.Timestamp(seg_ts[-1]).isoformat(),
            "duration_mins": round(duration_secs / 60.0, 1),
            "distance_km": round(dist_km, 2),
            "avg_speed_kmh": round(avg_speed, 1),
            "max_speed_kmh": round(max_speed, 1),
        })

    return trips


def _detect_events(
    speed_df: pd.DataFrame,
    trips: list[dict],
    sim_id: str,
    rng: np.random.Generator,
) -> list[dict]:
    ts_all = speed_df["_ts"].values
    sp_all = speed_df["_speed"].values
    events: list[dict] = []
    cumulative_km = 0.0

    for trip_idx, trip in enumerate(trips):
        seg_s = trip["_seg_s"]
        seg_e = trip["_seg_e"]
        seg_ts = ts_all[seg_s:seg_e]
        seg_speed = sp_all[seg_s:seg_e]

        if len(seg_ts) < 3:
            cumulative_km += trip["distance_km"]
            continue

        dt = np.diff(seg_ts.astype("int64")) / 1e9
        dv = np.diff(seg_speed)
        valid = (dt > 0.5) & (dt < MAX_ACC_DT_SECS)

        seg_dist_km = 0.0
        dt_capped = np.minimum(dt, GAP_THRESHOLD_SECS)

        for i in range(len(dt)):
            step_km = (seg_speed[i] + seg_speed[i + 1]) / 2.0 * dt_capped[i] / 3600.0
            seg_dist_km += step_km

            if not valid[i]:
                continue

            acc_g = (dv[i] / 3.6) / (dt[i] * 9.81)
            if abs(acc_g) > 1.5:
                continue

            evt_type: str | None = None
            final_acc_g = acc_g

            if acc_g < HARSH_BRAKE_G and seg_speed[i] > 5.0:
                evt_type = "braking"
            elif acc_g > HARSH_ACCEL_G and dv[i] > 0:
                evt_type = "accel"
            elif rng.random() < CORNER_INJECT_PROB and seg_speed[i + 1] > 20.0:
                evt_type = "cornering"
                sign = int(rng.integers(2)) * 2 - 1
                final_acc_g = sign * float(rng.uniform(0.27, 0.55))

            if evt_type:
                events.append({
                    "event_id": f"{sim_id}-evt-{len(events) + 1:04d}",
                    "trip_id": trip["trip_id"],
                    "timestamp": pd.Timestamp(seg_ts[i + 1]).isoformat(),
                    "type": evt_type,
                    "severity": "warning" if abs(final_acc_g) < 0.55 else "critical",
                    "speed_kmh": round(float(seg_speed[i + 1]), 1),
                    "acc_g": round(float(final_acc_g), 3),
                    "distance_km": round(cumulative_km + seg_dist_km, 2),
                })

        cumulative_km += trip["distance_km"]

    return events


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


def _find_route_end_km(route_points: list, veh_lat: float, veh_lng: float) -> float:
    best_km = 0.0
    best_dist = float("inf")
    for pt in route_points:
        d = (pt.lat - veh_lat) ** 2 + (pt.lng - veh_lng) ** 2
        if d < best_dist:
            best_dist = d
            best_km = pt.cumulative_km
    return best_km


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


def _process_vehicle(v: dict, data_root: str, computed_root: str) -> None:
    vid = v["id"]
    seed = abs(hash(vid)) % (2 ** 31)
    rng = np.random.default_rng(seed)

    print(f"  {vid}  status={v['status']}  health={v['health']}")

    speed_df = _load_speed_series(data_root, vid)

    if speed_df is not None and len(speed_df) >= 2:
        data_start_ts = pd.Timestamp(speed_df["_ts"].iloc[0])
        data_end_ts = pd.Timestamp(speed_df["_ts"].iloc[-1])
    else:
        print(f"    WARN: no transmission CSV — using synthetic 5-day window")
        data_end_ts = pd.Timestamp("2024-07-14T00:00:00", tz="UTC")
        data_start_ts = data_end_ts - pd.Timedelta(days=5)
        speed_df = None

    raw_trips = _detect_trips(speed_df) if speed_df is not None else []

    for i, t in enumerate(raw_trips):
        t["trip_id"] = f"{vid}-trip-{i + 1:03d}"

    events = _detect_events(speed_df, raw_trips, vid, rng) if (speed_df is not None and raw_trips) else []

    event_counts: dict[str, dict] = {}
    for e in events:
        tid = e["trip_id"]
        ec = event_counts.setdefault(tid, {"total": 0, "braking": 0, "accel": 0, "cornering": 0})
        ec["total"] += 1
        ec[e["type"]] += 1

    trips_out = [
        {
            "trip_id": t["trip_id"],
            "start_ts": t["start_ts"],
            "end_ts": t["end_ts"],
            "duration_mins": t["duration_mins"],
            "distance_km": t["distance_km"],
            "avg_speed_kmh": t["avg_speed_kmh"],
            "max_speed_kmh": t["max_speed_kmh"],
            "event_count": event_counts.get(t["trip_id"], {}).get("total", 0),
            "harsh_braking_count": event_counts.get(t["trip_id"], {}).get("braking", 0),
            "harsh_accel_count": event_counts.get(t["trip_id"], {}).get("accel", 0),
            "harsh_cornering_count": event_counts.get(t["trip_id"], {}).get("cornering", 0),
        }
        for t in raw_trips
    ]

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

    route_key = v.get("route")
    veh_lat = v.get("lat", 0.0)
    veh_lng = v.get("lng", 0.0)

    if route_key and trips_out:
        try:
            route = load_route(route_key)
            route_end_km = _find_route_end_km(route.points, veh_lat, veh_lng)
            total_km_trips = sum(t["distance_km"] for t in trips_out)
            route_start_km = max(0.0, route_end_km - total_km_trips)

            trip_offset_km = 0.0
            for trip in trips_out:
                seg_s = max(0.0, route_start_km + trip_offset_km)
                seg_e = min(route.total_km, seg_s + trip["distance_km"])
                waypoints = _extract_segment(route.points, seg_s, seg_e)
                trip["route_waypoints"] = [[round(lat, 6), round(lng, 6)] for lat, lng in waypoints]
                trip_offset_km += trip["distance_km"]

            for evt in events:
                evt_km = max(0.0, min(route.total_km, route_start_km + evt["distance_km"]))
                lat, lng = _interpolate_on_route(route.points, evt_km)
                evt["lat"] = round(lat, 6)
                evt["lng"] = round(lng, 6)
        except Exception as exc:
            print(f"    WARN: route GPS assignment failed ({exc})")

    out_dir = os.path.join(computed_root, vid)
    os.makedirs(out_dir, exist_ok=True)

    for filename, payload in [
        ("trips.json", trips_out),
        ("events.json", events),
        ("dtcs.json", dtcs),
        ("alerts.json", alerts),
        ("driver_summary.json", driver_summary),
        ("last_state.json", last_state),
    ]:
        with open(os.path.join(out_dir, filename), "w", encoding="utf-8") as fh:
            json.dump(payload, fh, indent=2, default=str)

    print(f"    trips={len(trips_out)}  events={len(events)}  dtcs={len(dtcs)}  alerts={len(alerts)}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Precompute history for non-active vehicles")
    parser.add_argument("--data-root", required=True, help="Root dir containing expanded vehicle CSV dirs")
    parser.add_argument("--computed-root", required=True, help="Output root for computed JSON layers")
    parser.add_argument("--yes", action="store_true", help="Skip confirmation prompt")
    args = parser.parse_args()

    data_root = os.path.abspath(args.data_root)
    computed_root = os.path.abspath(args.computed_root)

    non_active = [v for v in VEHICLES if v["status"] != "active"]

    print(f"\nData root    : {data_root}")
    print(f"Computed root: {computed_root}")
    print(f"Vehicles     : {len(non_active)} non-active\n")

    if not args.yes:
        ans = input("Proceed? [y/N] ").strip().lower()
        if ans != "y":
            print("Aborted.")
            sys.exit(0)
        print()

    for v in non_active:
        _process_vehicle(v, data_root, computed_root)

    print(f"\nDone. Output written to: {computed_root}")


if __name__ == "__main__":
    main()
