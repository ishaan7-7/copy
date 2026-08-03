P_BRAKE = 2.2
P_ACCEL = 1.4
P_CORNER = 2.2

SCORE_NORM = 550.0
SCORE_EXPONENT = 2.0


def compute_driver_score(braking_events: int, accel_events: int, cornering_events: int, total_distance_km: float) -> float:
    weighted = braking_events * P_BRAKE + accel_events * P_ACCEL + cornering_events * P_CORNER
    rate = weighted / max(total_distance_km, 0.1)
    return max(0.0, round(100.0 - SCORE_NORM * (rate ** SCORE_EXPONENT), 1))
