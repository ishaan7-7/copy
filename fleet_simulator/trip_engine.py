import time
import random
import math
from dataclasses import dataclass, field

from route_data import DenseRoute, RoutePoint, build_all_routes, _haversine_km
from fleet_config import VEHICLES
from behavior_engine import (
    BehaviorState, compute_g_forces, detect_events,
    update_behavior, get_risk_radar, get_speed_distribution,
)


@dataclass
class VehicleState:
    vehicle_id: str
    route_key: str
    route: DenseRoute
    position_index: int = 0
    direction: int = 1
    elapsed_km: float = 0.0
    current_speed: float = 0.0
    current_heading: float = 0.0
    behavior: BehaviorState = field(default_factory=BehaviorState)
    event_markers: list = field(default_factory=list)
    last_update_time: float = 0.0
    start_offset_km: float = 0.0
    prev_speed: float = 0.0
    ticks_since_event: int = 0
    driver_aggression: float = 0.5


class TripEngine:
    def __init__(self):
        self.routes: dict[str, DenseRoute] = {}
        self.active_vehicles: dict[str, VehicleState] = {}
        self.all_vehicles: list[dict] = VEHICLES
        self._start_time: float = 0.0

    def initialize(self):
        self.routes = build_all_routes()
        self._start_time = time.time()

        for v in self.all_vehicles:
            if v["status"] != "active":
                continue

            route_key = v["route"]
            route = self.routes[route_key]
            start_pct = random.uniform(0.25, 0.55)
            start_idx = int(len(route.points) * start_pct)

            init_heading = 0.0
            if start_idx + 1 < len(route.points):
                p1, p2 = route.points[start_idx], route.points[start_idx + 1]
                dlat = math.radians(p2.lat - p1.lat)
                dlng = math.radians(p2.lng - p1.lng) * math.cos(math.radians(p1.lat))
                init_heading = math.degrees(math.atan2(dlng, dlat)) % 360

            aggression = random.uniform(0.3, 0.9)

            state = VehicleState(
                vehicle_id=v["id"],
                route_key=route_key,
                route=route,
                position_index=start_idx,
                direction=1,
                elapsed_km=route.points[start_idx].cumulative_km,
                current_speed=route.points[start_idx].speed_target_kmh,
                current_heading=init_heading,
                start_offset_km=route.points[start_idx].cumulative_km,
                last_update_time=time.time(),
                prev_speed=route.points[start_idx].speed_target_kmh,
                driver_aggression=aggression,
            )

            self._backfill_trip_history(state)
            self.active_vehicles[v["id"]] = state

    def _backfill_trip_history(self, state: VehicleState):
        pts = state.route.points
        end_idx = state.position_index
        agg = state.driver_aggression

        sample_step = max(1, end_idx // 600)
        prev_speed = pts[0].speed_target_kmh
        prev_heading = state.current_heading
        ticks_since = 10

        for i in range(0, end_idx, sample_step):
            pt = pts[i]
            speed = pt.speed_target_kmh + random.gauss(0, 4)
            speed = max(15.0, speed)
            cum_km = pt.cumulative_km

            if i > 0:
                prev_pt = pts[max(0, i - sample_step)]
                seg_dist_m = _haversine_km(prev_pt.lat, prev_pt.lng, pt.lat, pt.lng) * 1000
            else:
                seg_dist_m = 50.0

            delta_speed = speed - prev_speed
            base_acc_x = (delta_speed / 3.6) / (1.0 * 9.81) + random.gauss(0, 0.02)
            base_acc_y = random.gauss(0, 0.04)

            ticks_since += 1
            event_chance = 0.025 * agg
            if pt.road_type == "urban":
                event_chance *= 2.0
            elif pt.road_type == "primary":
                event_chance *= 1.4
            if ticks_since < 10:
                event_chance *= 0.05

            acc_x = base_acc_x
            acc_y = base_acc_y
            event_fired = False

            if random.random() < event_chance:
                ticks_since = 0
                roll = random.random()
                if roll < 0.40:
                    acc_x = random.uniform(-0.55, -0.36) * (0.7 + 0.6 * agg)
                    evt_type = "braking"
                elif roll < 0.70:
                    acc_x = random.uniform(0.26, 0.45) * (0.7 + 0.6 * agg)
                    evt_type = "accel"
                else:
                    sign = random.choice([-1, 1])
                    threshold = 0.25 if pt.road_type == "highway" else 0.45
                    acc_y = sign * random.uniform(threshold + 0.02, threshold + 0.25) * (0.7 + 0.6 * agg)
                    evt_type = "cornering"

                events = detect_events(acc_x, acc_y, speed, pt.road_type, delta_speed)
                if any(events.values()):
                    event_fired = True
                    state.event_markers.append({
                        "lat": round(pt.lat + random.gauss(0, 0.00005), 6),
                        "lng": round(pt.lng + random.gauss(0, 0.00005), 6),
                        "type": evt_type,
                        "acc_x": round(acc_x, 3),
                        "acc_y": round(acc_y, 3),
                        "speed": round(speed, 1),
                        "distance_km": round(cum_km, 2),
                    })

            acc_x = max(-1.5, min(1.5, acc_x))
            acc_y = max(-1.5, min(1.5, acc_y))

            evt_dict = {
                "harsh_braking": event_fired and evt_type == "braking",
                "harsh_accel": event_fired and evt_type == "accel",
                "harsh_cornering": event_fired and evt_type == "cornering",
            } if event_fired else {"harsh_braking": False, "harsh_accel": False, "harsh_cornering": False}

            update_behavior(
                state.behavior, evt_dict, seg_dist_m,
                cum_km, speed, pt.road_type, acc_x, acc_y,
            )

            prev_speed = speed

    def _inject_driving_perturbation(self, state: VehicleState, road_type: str) -> tuple[float, float]:
        agg = state.driver_aggression
        state.ticks_since_event += 1

        base_event_chance = 0.025 * agg
        if road_type == "urban":
            base_event_chance *= 1.8
        elif road_type == "primary":
            base_event_chance *= 1.3

        if state.ticks_since_event < 10:
            base_event_chance *= 0.05

        acc_x_inject = 0.0
        acc_y_inject = 0.0

        if random.random() < base_event_chance:
            event_roll = random.random()
            state.ticks_since_event = 0

            if event_roll < 0.40:
                acc_x_inject = random.uniform(-0.55, -0.36) * (0.7 + 0.6 * agg)
            elif event_roll < 0.70:
                acc_x_inject = random.uniform(0.26, 0.45) * (0.7 + 0.6 * agg)
            else:
                sign = random.choice([-1, 1])
                threshold = 0.25 if road_type == "highway" else 0.45
                acc_y_inject = sign * random.uniform(threshold + 0.01, threshold + 0.25) * (0.7 + 0.6 * agg)

        return acc_x_inject, acc_y_inject

    def tick(self):
        now = time.time()
        for vid, state in self.active_vehicles.items():
            dt = now - state.last_update_time
            if dt < 0.8:
                continue

            state.last_update_time = now
            route = state.route
            pts = route.points

            curr_pt = pts[state.position_index]
            target_speed = curr_pt.speed_target_kmh + random.gauss(0, 4.0)
            target_speed = max(15.0, target_speed)

            alpha = min(1.0, dt * 0.4)
            state.prev_speed = state.current_speed
            state.current_speed = state.current_speed * (1 - alpha) + target_speed * alpha

            distance_m = (state.current_speed / 3.6) * dt
            distance_km = distance_m / 1000.0

            prev_pt = pts[state.position_index]

            steps_to_advance = 0
            remaining_m = distance_m
            check_idx = state.position_index

            while remaining_m > 0:
                next_idx = check_idx + state.direction
                if next_idx < 0 or next_idx >= len(pts):
                    break
                seg_dist = _haversine_km(
                    pts[check_idx].lat, pts[check_idx].lng,
                    pts[next_idx].lat, pts[next_idx].lng,
                ) * 1000
                if seg_dist <= 0:
                    check_idx = next_idx
                    steps_to_advance += 1
                    continue
                if remaining_m >= seg_dist:
                    remaining_m -= seg_dist
                    check_idx = next_idx
                    steps_to_advance += 1
                else:
                    break

            new_idx = state.position_index + (steps_to_advance * state.direction)
            if new_idx >= len(pts) - 1:
                state.direction = -1
                new_idx = len(pts) - 2
            elif new_idx <= 0:
                state.direction = 1
                new_idx = 1

            state.position_index = new_idx
            new_pt = pts[new_idx]

            look_idx = new_idx + state.direction
            if 0 <= look_idx < len(pts):
                look_pt = pts[look_idx]
            else:
                look_pt = new_pt

            g_data = compute_g_forces(
                prev_pt.lat, prev_pt.lng, state.prev_speed, state.current_heading,
                look_pt.lat, look_pt.lng, state.current_speed, dt,
            )
            state.current_heading = g_data["heading"]

            inject_x, inject_y = self._inject_driving_perturbation(state, new_pt.road_type)
            final_acc_x = g_data["acc_x"] + inject_x
            final_acc_y = g_data["acc_y"] + inject_y
            final_acc_x = max(-1.5, min(1.5, final_acc_x))
            final_acc_y = max(-1.5, min(1.5, final_acc_y))

            delta_v = state.current_speed - state.prev_speed
            events = detect_events(
                final_acc_x, final_acc_y,
                state.current_speed, new_pt.road_type, delta_v,
            )

            state.elapsed_km += distance_km

            update_behavior(
                state.behavior, events, distance_m,
                state.elapsed_km, state.current_speed,
                new_pt.road_type, final_acc_x, final_acc_y,
            )

            if any(events.values()):
                evt_type = "braking" if events["harsh_braking"] else "accel" if events["harsh_accel"] else "cornering"
                evt_lat = look_pt.lat
                evt_lng = look_pt.lng
                frac = remaining_m / max(distance_m, 0.01)
                evt_lat = new_pt.lat + (look_pt.lat - new_pt.lat) * (1 - frac) + random.gauss(0, 0.0001)
                evt_lng = new_pt.lng + (look_pt.lng - new_pt.lng) * (1 - frac) + random.gauss(0, 0.0001)
                state.event_markers.append({
                    "lat": round(evt_lat, 6),
                    "lng": round(evt_lng, 6),
                    "type": evt_type,
                    "acc_x": round(final_acc_x, 3),
                    "acc_y": round(final_acc_y, 3),
                    "speed": round(state.current_speed, 1),
                    "distance_km": round(state.elapsed_km, 2),
                })
                if len(state.event_markers) > 500:
                    state.event_markers = state.event_markers[-500:]

    def get_all_positions(self) -> list[dict]:
        result = []
        for v in self.all_vehicles:
            if v["status"] == "active" and v["id"] in self.active_vehicles:
                st = self.active_vehicles[v["id"]]
                pt = st.route.points[st.position_index]
                result.append({
                    "vehicle_id": v["id"],
                    "name": v["name"],
                    "type": v["type"],
                    "status": "active",
                    "lat": round(pt.lat, 6),
                    "lng": round(pt.lng, 6),
                    "heading": round(st.current_heading, 1),
                    "speed": round(st.current_speed, 1),
                    "health": v["health"],
                    "engine_health": round(v.get("module_health", {}).get("engine", v["health"]), 1),
                    "driver": v["driver"],
                    "driver_score": round(st.behavior.score, 1),
                    "road_type": pt.road_type,
                    "route_name": st.route.name,
                })
            else:
                result.append({
                    "vehicle_id": v["id"],
                    "name": v["name"],
                    "type": v["type"],
                    "status": v["status"],
                    "lat": v.get("lat", 0),
                    "lng": v.get("lng", 0),
                    "heading": 0,
                    "speed": 0,
                    "health": v["health"],
                    "engine_health": round(v.get("module_health", {}).get("engine", v["health"]), 1),
                    "driver": v["driver"],
                    "driver_score": 100.0,
                    "road_type": "",
                    "route_name": v.get("city", ""),
                })
        return result

    def get_vehicle_detail(self, vehicle_id: str) -> dict | None:
        v = next((x for x in self.all_vehicles if x["id"] == vehicle_id), None)
        if not v:
            return None

        base = {
            "vehicle_id": v["id"],
            "name": v["name"],
            "type": v["type"],
            "status": v["status"],
            "health": v["health"],
            "composite": v.get("composite", 0),
            "driver": v["driver"],
            "module_health": v.get("module_health", {}),
            "city": v.get("city", ""),
        }

        if v["status"] == "active" and vehicle_id in self.active_vehicles:
            st = self.active_vehicles[vehicle_id]
            pt = st.route.points[st.position_index]
            base.update({
                "lat": round(pt.lat, 6),
                "lng": round(pt.lng, 6),
                "heading": round(st.current_heading, 1),
                "speed": round(st.current_speed, 1),
                "driver_score": round(st.behavior.score, 1),
                "road_type": pt.road_type,
                "route_name": st.route.name,
                "route_origin": st.route.origin,
                "route_destination": st.route.destination,
                "elapsed_km": round(st.elapsed_km, 1),
                "total_km": round(st.route.total_km, 1),
            })
        else:
            base.update({
                "lat": v.get("lat", 0),
                "lng": v.get("lng", 0),
                "heading": 0,
                "speed": 0,
                "driver_score": 100.0,
                "road_type": "",
            })

        return base

    def get_trip_data(self, vehicle_id: str) -> dict | None:
        if vehicle_id not in self.active_vehicles:
            return None

        st = self.active_vehicles[vehicle_id]
        pts = st.route.points
        n_pts = len(pts)

        step = max(1, n_pts // 800)

        sampled_indices = list(range(0, n_pts, step))
        if sampled_indices[-1] != n_pts - 1:
            sampled_indices.append(n_pts - 1)

        completed_sampled = st.position_index // step

        route_coords = []
        for idx in sampled_indices:
            p = pts[idx]
            route_coords.append({
                "lat": round(p.lat, 5),
                "lng": round(p.lng, 5),
                "road_type": p.road_type,
            })

        progress = st.position_index / max(n_pts - 1, 1)

        return {
            "route": route_coords,
            "completed_index": min(completed_sampled, len(route_coords) - 1),
            "progress_pct": round(progress * 100, 1),
            "distance_completed_km": round(pts[st.position_index].cumulative_km if st.direction == 1 else st.route.total_km - pts[st.position_index].cumulative_km, 1),
            "distance_total_km": round(st.route.total_km, 1),
            "events": st.event_markers[-200:],
            "origin": st.route.origin,
            "destination": st.route.destination,
            "route_name": st.route.name,
        }

    def get_behavior_data(self, vehicle_id: str) -> dict | None:
        if vehicle_id not in self.active_vehicles:
            return None

        st = self.active_vehicles[vehicle_id]
        beh = st.behavior

        return {
            "current_score": round(beh.score, 1),
            "score_timeline": beh.score_timeline[-500:],
            "traction_circle": beh.traction_data[-500:],
            "risk_radar": get_risk_radar(beh),
            "speed_by_road": get_speed_distribution(beh),
            "event_summary": {
                "braking": beh.total_braking,
                "accel": beh.total_accel,
                "cornering": beh.total_cornering,
                "total": beh.total_braking + beh.total_accel + beh.total_cornering,
            },
            "trip_distance_km": round(beh.total_distance_km, 1),
        }
