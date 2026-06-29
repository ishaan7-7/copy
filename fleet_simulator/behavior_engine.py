import math
import random
from dataclasses import dataclass, field


@dataclass
class BehaviorState:
    score: float = 100.0
    clean_distance_m: float = 0.0
    total_braking: int = 0
    total_accel: int = 0
    total_cornering: int = 0
    total_distance_km: float = 0.0
    score_timeline: list = field(default_factory=list)
    traction_data: list = field(default_factory=list)
    speed_by_road: dict = field(default_factory=lambda: {"highway": [], "primary": [], "urban": []})


P_BRAKE = 3.0
P_ACCEL = 2.0
P_CORNER = 3.0
RECOVERY_DIST_M = 2000.0


def compute_g_forces(
    prev_lat: float, prev_lng: float, prev_speed_kmh: float, prev_heading: float,
    curr_lat: float, curr_lng: float, curr_speed_kmh: float, delta_t: float,
) -> dict:
    if delta_t <= 0:
        return {"acc_x": 0.0, "acc_y": 0.0, "heading": prev_heading, "yaw_rate": 0.0}

    speed_ms = curr_speed_kmh / 3.6
    prev_speed_ms = prev_speed_kmh / 3.6

    acc_x = (speed_ms - prev_speed_ms) / (delta_t * 9.81)

    dlat = math.radians(curr_lat - prev_lat)
    dlng = math.radians(curr_lng - prev_lng) * math.cos(math.radians(curr_lat))

    if abs(dlat) < 1e-10 and abs(dlng) < 1e-10:
        heading = prev_heading
    else:
        heading = math.degrees(math.atan2(dlng, dlat)) % 360

    delta_heading = heading - prev_heading
    if delta_heading > 180:
        delta_heading -= 360
    elif delta_heading < -180:
        delta_heading += 360

    yaw_rate = abs(delta_heading) / delta_t

    avg_speed = (speed_ms + prev_speed_ms) / 2.0
    acc_y = (avg_speed * math.radians(abs(delta_heading)) / delta_t) / 9.81

    if delta_heading < 0:
        acc_y = -acc_y

    noise_x = random.gauss(0, 0.015)
    noise_y = random.gauss(0, 0.015)
    acc_x = max(-1.5, min(1.5, acc_x + noise_x))
    acc_y = max(-1.5, min(1.5, acc_y + noise_y))

    return {
        "acc_x": round(acc_x, 4),
        "acc_y": round(acc_y, 4),
        "heading": round(heading, 2),
        "yaw_rate": round(yaw_rate, 3),
    }


def detect_events(acc_x: float, acc_y: float, speed_kmh: float, road_type: str, delta_v: float) -> dict:
    harsh_braking = acc_x < -0.35
    harsh_accel = acc_x > 0.25 and delta_v > 0

    high_speed_roads = {"highway"}
    if road_type in high_speed_roads and abs(acc_y) < 0.25:
        cornering_threshold = 0.25
    else:
        cornering_threshold = 0.45
    harsh_cornering = abs(acc_y) > cornering_threshold and speed_kmh > 20.0

    return {
        "harsh_braking": harsh_braking,
        "harsh_accel": harsh_accel,
        "harsh_cornering": harsh_cornering,
    }


def update_behavior(state: BehaviorState, events: dict, distance_m: float, distance_km: float, speed: float, road_type: str, acc_x: float, acc_y: float) -> None:
    penalty = 0.0
    event_type = None

    if events["harsh_braking"]:
        penalty += P_BRAKE
        state.total_braking += 1
        event_type = "braking"
    if events["harsh_accel"]:
        penalty += P_ACCEL
        state.total_accel += 1
        event_type = "accel"
    if events["harsh_cornering"]:
        penalty += P_CORNER
        state.total_cornering += 1
        event_type = "cornering"

    if penalty > 0:
        state.score = max(0.0, state.score - penalty)
        state.clean_distance_m = 0.0
    else:
        state.clean_distance_m += distance_m
        while state.clean_distance_m >= RECOVERY_DIST_M:
            state.score = min(100.0, state.score + 1.0)
            state.clean_distance_m -= RECOVERY_DIST_M

    state.total_distance_km += distance_m / 1000.0

    state.score_timeline.append({
        "distance_km": round(distance_km, 2),
        "score": round(state.score, 1),
        "event_type": event_type,
    })

    state.traction_data.append({
        "acc_x": round(acc_x, 3),
        "acc_y": round(acc_y, 3),
        "speed": round(speed, 1),
    })

    road_key = road_type if road_type in state.speed_by_road else "primary"
    state.speed_by_road[road_key].append(round(speed, 1))

    max_history = 3000
    if len(state.score_timeline) > max_history:
        state.score_timeline = state.score_timeline[-max_history:]
    if len(state.traction_data) > max_history:
        state.traction_data = state.traction_data[-max_history:]
    for k in state.speed_by_road:
        if len(state.speed_by_road[k]) > max_history:
            state.speed_by_road[k] = state.speed_by_road[k][-max_history:]


def get_risk_radar(state: BehaviorState) -> dict:
    dist = max(state.total_distance_km, 0.1)
    return {
        "braking_per_100km": round((state.total_braking / dist) * 100, 1),
        "accel_per_100km": round((state.total_accel / dist) * 100, 1),
        "cornering_per_100km": round((state.total_cornering / dist) * 100, 1),
    }


def get_speed_distribution(state: BehaviorState) -> dict:
    import numpy as np
    result = {}
    for road, speeds in state.speed_by_road.items():
        if len(speeds) < 3:
            continue
        arr = np.array(speeds)
        result[road] = {
            "min": round(float(arr.min()), 1),
            "q1": round(float(np.percentile(arr, 25)), 1),
            "median": round(float(np.median(arr)), 1),
            "q3": round(float(np.percentile(arr, 75)), 1),
            "max": round(float(arr.max()), 1),
            "mean": round(float(arr.mean()), 1),
        }
    return result
