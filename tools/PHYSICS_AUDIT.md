# Physics Audit & Algorithm Reference

Generated: **2026-07-20 21:02 UTC**  |  Data root: `C:\streaming_emulator\data\vehicles`

This document has three sections:
1. **Algorithm Reference** — all constants and derivation logic from the fix_* scripts
2. **Data Audit** — per-vehicle, per-module statistics from whatever CSVs were found
3. **Expansion Blueprint** — plan for building 40 vehicles from 7 using date cuts

When you run this script on the demo device, Section 2 will be filled with the real
data statistics. Give the combined document back to Claude to continue the work.

---

## 1. Algorithm Reference

### 1.1 Shared Infrastructure

#### Deterministic RNG
```
seed = sha256(f'{sim_id}:{salt}').digest()[:8]  →  np.random.default_rng(seed)
Every signal is reproducible: same sim_id + same timestamps → identical output.
New vehicles only need a new sim_id string.
```

#### Gap Detection (all scripts)
```
median_dt   = median of consecutive timestamp differences (seconds)
gap_thr     = max(GAP_MULTIPLIER * median_dt, GAP_MIN_S)
              = max(5 * median_dt, 300s)
A gap is any dt_s > gap_thr — treated as a trip boundary (engine off/sleep).
Scripts auto-adapt: at 1s resolution median_dt=1 → gap_thr=300s (5 min).
```

#### Speed Backbone (AR1 + EMA + ramp)
```
noise_std = std * sqrt(1 - ar²)   ← drives AR1 innovation
AR1:   x[i] = ar * x[i-1] + (1-ar) * mean + N(0, noise_std)
EMA:   y[i] = alpha * x[i] + (1-alpha) * y[i-1]
Ramp:  scale first/last N rows linearly from 0 (trip start/end)
```

| Profile | mean | std | AR | max | EMA alpha | ramp rows |
|---------|------|-----|----|-----|-----------|-----------|
| Urban   | 22.0 km/h | 11.0 | 0.87 | 48.0 | 0.12 | 120 |
| Highway | 76.0 km/h | 6.0 | 0.97 | 88.0 | 0.04 | 90 |

Urban stop injection: p=0.06 per row, duration=4–30s
Highway slowdown:     p=0.008 per row, target 35–55 km/h for 8–25s
Trip mode: 55% urban, 44% highway (seeded per-trip)

### 1.2 Transmission & Engine (`fix_vehicle_physics.py`)

Columns: `vehicle_speed_kmh, gear_position_actual, gear_commanded_target, engine_rpm, engine_load_absolute_pct, engine_load_calculated_pct, torque_converter_slip_speed`

#### Gear state machine

| Gear | Upshift (km/h) | Downshift (km/h) | RPM/km/h |
|------|---------------|-----------------|----------|
| 1 | 16.0 | 0.0 | 65.0 |
| 2 | 29.0 | 12.0 | 41.0 |
| 3 | 47.0 | 23.0 | 27.0 |
| 4 | 67.0 | 40.0 | 20.0 |
| 5 | 83.0 | 60.0 | 16.0 |
| 6 | 999.0 | 74.0 | 13.0 |

Min dwell: 4 rows before shift allowed.

#### RPM
```
nominal[i] = max(720.0, speed[i] * gear_rpm_k[gear[i]])
AR1: ar=0.82, noise_std=35.0, clip=[720.0, 2250]
```

#### Engine Load (%)
```
base   = 0.15 + (speed / 88.0) * 0.45
accel  = clip(Δspeed/dt, 0, ∞) * 25.0
decel  = clip(-Δspeed/dt, 0, ∞) * 15.0
AR1: ar=0.78, noise_std=4.0, clip=[5, 97]
```

#### TC Slip (RPM)
```
cruise_slip = 40.0 * (load/100)
load_slip   = 200.0 * max(0, (load_frac - 0.40) / 0.60)
shift_peak  = 720.0 immediately post-shift, decays * 0.55 per row
```

Engine (`fix_vehicle_physics.py`): columns `engine_rpm_rpm, engine_load_absolute` — same speed backbone, separate RNG salts.

### 1.3 Fuel & Odometer

**Fuel** — column: `fuel_level_pct` | Tank: 200.0 L
```
Start: 65.0–90.0% (per-sim seed)
Idle consumption:  2.8 L/h
Driving:           (12.0 + load_frac * 10.0) L/100km
Refuel at gap:     >4h → p=0.55 of refuelling
                   >12h → always refuel
Refuel amount:     20–50% of tank
```

**Odometer** — column: `odometer_reading`
```
Start: 25,000–140,000 km (per-sim seed)
km += speed_kmh * dt_s / 3600  (zeroed during gaps)
```

### 1.4 Battery (`fix_battery_physics.py`)

**System**: 24V lead-acid (two 12V in series), diesel starter + accessories
Columns: `battery_state_of_charge_soc_pct, battery_state_of_health_soh_pct, battery_temperature_cell, battery_voltage_ecu_7ee`

| Signal | Formula summary | Range |
|--------|----------------|-------|
| SoC (%) | Charge 0.40‰/s while moving; park drain 1.5%/h | [50.0, 97.0] |
| SoH (%) | linspace fade, 0.0008 %/h | [72.0, 99.0] |
| Temp (C) | lag toward ambient+10.0°C if charging, τ=1800.0s | [20, 65] |
| Voltage (V) | charging: AR1(28.2V); resting: 23.0+(SoC/100)*2.6 | [22.5, 29.2] |

> ⚠️  If existing data shows ~14V, halve VOLT_* constants — single 12V battery

### 1.5 Cabin (`fix_cabin_physics.py`)

Columns: `cabin_temperature, cabin_humidity_pct, ac_compressor_load_pct`

Ambient: 32.0–42.0°C, RH 35.0–72.0%
AC trucks: 80% of fleet | Setpoint: 22.0–26.0°C

```
thermal lag:  cur += (1 - exp(-dt/tau)) * (target - cur)
  tau_ac    = 480.0s  (AC cooling ~8 min)
  tau_vent  = 720.0s  (ventilation only)
  tau_soak  = 300.0s  (parked, cabin heating)
humidity: dehumid at ≤0.04%/s, drifts back τ=900.0s
```

### 1.6 Tyre (`fix_tyre_physics.py`)

Spec: 10.00R20 / 295-80R22.5  medium-heavy truck 10-14t GVW
Columns: `tyre_pressure_fl_psi, tyre_pressure_fr_psi, tyre_pressure_rl_psi, tyre_pressure_rr_psi, tyre_temp_fl_c, tyre_temp_fr_c, tyre_wear_fl_pct, tyre_wear_fr_pct, tyre_wear_rl_pct, tyre_wear_rr_pct`

| Signal | Nominal | Formula |
|--------|---------|---------|
| FL/FR pressure (PSI) | 90.0 cold | cold + (temp-35.0)*0.22 + noise |
| RL/RR pressure (PSI) | 105.0 cold | RL=FL_temp+6.3, RR=FR_temp+5.8 |
| FL/FR temp (°C) | 34.0–42.0+28.0 | lag toward ambient+Δ(speed/80.0), τ=900.0s |
| FL/FR wear (%) | 68.0–97.0 start | initial - 0.0035%/km (front), floor=15.0% |
| RL/RR wear (%) | 65.0–96.0 start | initial - 0.0028%/km (rear) |

### 1.7 Fleet Simulator (`trip_engine.py`, `route_data.py`)

Routes: `delhi_lucknow, delhi_jaipur, delhi_chandigarh, delhi_agra, lucknow_varanasi, jaipur_udaipur, delhi_dehradun`

| Road type | Speed target |
|-----------|-------------|
| highway | 82.0 km/h |
| primary | 60.0 km/h |
| urban | 22.0 km/h |

Driver aggression: uniform [0.3, 0.9] per vehicle
Route format: `routes/<key>.json` → `{coordinates: [[lat,lng]], road_types: [...]}`

---

## 2. Data Audit

Data root scanned: `C:\streaming_emulator\data\vehicles`

Vehicles found: **7** — `sim001, sim002, sim003, sim007, sim008, sim009, sim010`

### 2.1 sim001

#### Module: `engine`
File: `synthetic_engine_inference_scenarioA_sim001.csv` | Rows: **756,000**

| span | start | end | median_dt | gap_thr | n_trips |
|------|-------|-----|-----------|---------|---------|
| 42.12d | 2024-07-05 08:00:00 | 2024-08-16 10:59:59 | 1.0s | 300s | 43 |


| Column | Min | Mean | Max | Null% |
|--------|-----|------|-----|-------|
| `engine_rpm_rpm` | 720.0 | 925.9458 | 1564.9734 | 0.0% |
| `engine_load_absolute` | 5.0 | 35.5548 | 97.0 | 0.0% |

Other columns (24): `date, source_id, air_fuel_ratio_commanded_1, air_fuel_ratio_measured_1, catalyst_temperature_bank_1_sensor_1, catalyst_temperature_bank_1_sensor_2, engine_kw_at_the_wheels_kw, engine_oil_temperature, fuel_flow_rate_hour_l_hr, fuel_trim_bank_1_long_term, fuel_trim_bank_1_short_term, mass_air_flow_rate_g_s, o2_sensor1_wide_range_current_ma, o2_bank_1_sensor_2_voltage_v, timing_advance, turbo_boost_vacuum_gauge_psi, voltage_control_module_v, volumetric_efficiency_calculated, ecu_7ea_engine_coolant_temperature, ecu_7ea_intake_air_temperature…`

#### Module: `transmission`
File: `synthetic_transmission_inference_scenarioA_sim001.csv` | Rows: **756,000**

| span | start | end | median_dt | gap_thr | n_trips |
|------|-------|-----|-----------|---------|---------|
| 42.12d | 2024-07-05 08:00:00 | 2024-08-16 10:59:59 | 1.0s | 300s | 43 |


| Column | Min | Mean | Max | Null% |
|--------|-----|------|-----|-------|
| `vehicle_speed_kmh` | 0.0 | 31.9209 | 86.1742 | 0.0% |
| `gear_position_actual` | 1.0 | 2.5987 | 6.0 | 0.0% |
| `gear_commanded_target` | 1.0 | 2.5987 | 6.0 | 0.0% |
| `engine_rpm` | 720.0 | 926.1273 | 1550.9316 | 0.0% |
| `engine_load_absolute_pct` | 5.0 | 35.5821 | 97.0 | 0.0% |
| `engine_load_calculated_pct` | 5.0 | 35.5821 | 97.0 | 0.0% |
| `torque_converter_slip_speed` | 0.0 | 89.031 | 965.454 | 0.0% |

Other columns (22): `date, source_id, transmission_oil_temperature, transmission_oil_pressure, clutch_engagement_per_slip, actual_engine_pct_torque, driver_demand_engine_pct_torque, engine_reference_torque_nm, acceleration_sensor_total_g, throttle_position_manifold_pct, accelerator_pedal_position_d_per_e_per_f_pct, air_fuel_ratio_commanded, air_fuel_ratio_measured, boost_pressure_commanded_a_per_b, boost_pressure_sensor_a_per_b, egr_commanded_pct, egr_error_pct, catalyst_temperatures_bank_sensors, bearing_heading_per_vehicle_yaw, accel_x_g…`

#### Module: `battery`
File: `synthetic_battery_inference_scenarioA_sim001.csv` | Rows: **756,000**

| span | start | end | median_dt | gap_thr | n_trips |
|------|-------|-----|-----------|---------|---------|
| 42.12d | 2024-07-05 08:00:00 | 2024-08-16 10:59:59 | 1.0s | 300s | 43 |


| Column | Min | Mean | Max | Null% |
|--------|-----|------|-----|-------|
| `battery_state_of_charge_soc_pct` | 50.0 | 52.7383 | 93.75 | 0.0% |
| `battery_state_of_health_soh_pct` | 95.822 | 96.2264 | 96.631 | 0.0% |
| `battery_temperature_cell` | 33.505 | 43.6013 | 46.928 | 0.0% |
| `battery_voltage_ecu_7ee` | 24.17 | 28.0816 | 28.911 | 0.0% |

Other columns (22): `date, source_id, battery_current, hv_battery_pack_voltage, hv_battery_pack_current, internal_resistance_impedance, alternator_load_pct, alternator_voltage_output, energy_consumption_per_km_wh_per_km_per_inr_per_km, regenerative_energy_recovered, distance_to_empty_km, average_trip_speed_while_moving, average_trip_speed_overall, ambient_air_temperature, barometer_android_device_mb, engine_coolant_temperature, charging_power_kw, charging_efficiency_pct, auxiliary_12v_battery_current_draw, fuel_consumption_km_per_l_or_l_per_100_km…`

#### Module: `body`
File: `synthetic_body_inference_scenarioA_sim001.csv` | Rows: **756,000**

| span | start | end | median_dt | gap_thr | n_trips |
|------|-------|-----|-----------|---------|---------|
| 42.12d | 2024-07-05 08:00:00 | 2024-08-16 10:59:59 | 1.0s | 300s | 43 |


| Column | Min | Mean | Max | Null% |
|--------|-----|------|-----|-------|
| `fuel_level_pct` | 50.817 | 89.6352 | 100.0 | 0.0% |
| `cabin_temperature` | 18.729 | 36.9256 | 55.352 | 0.0% |
| `cabin_humidity_pct` | 37.195 | 39.3781 | 41.321 | 0.0% |
| `ac_compressor_load_pct` | 0.0 | 0.0 | 0.0 | 0.0% |
| `odometer_reading` | 29049.0 | 32548.4389 | 35813.38 | 0.0% |

Other columns (8): `date, source_id, ambient_air_temperature_body, hvac_blower_speed, window_open_pct, sunroof_position_pct, distance_since_codes_cleared, distance_with_mil_lit`

#### Module: `tyre`
File: `synthetic_tyre_inference_scenarioA_sim001.csv` | Rows: **641,797**

| span | start | end | median_dt | gap_thr | n_trips |
|------|-------|-----|-----------|---------|---------|
| 34.09d | 2024-07-05 08:00:00 | 2024-08-08 10:16:36 | 1.0s | 300s | 35 |


| Column | Min | Mean | Max | Null% |
|--------|-----|------|-----|-------|
| `tyre_pressure_fl_psi` | 99.632 | 102.8812 | 105.0 | 0.0% |
| `tyre_pressure_fr_psi` | 94.531 | 98.112 | 103.261 | 0.0% |
| `tyre_pressure_rl_psi` | 103.367 | 106.9963 | 112.292 | 0.0% |
| `tyre_pressure_rr_psi` | 104.008 | 107.5999 | 112.738 | 0.0% |
| `tyre_temp_fl_c` | 42.119 | 56.1772 | 75.122 | 0.0% |
| `tyre_temp_fr_c` | 36.521 | 50.1507 | 68.381 | 0.0% |
| `tyre_wear_fl_pct` | 64.143 | 74.3164 | 84.997 | 0.0% |
| `tyre_wear_fr_pct` | 75.955 | 86.1361 | 96.843 | 0.0% |
| `tyre_wear_rl_pct` | 76.168 | 84.3377 | 92.928 | 0.0% |
| `tyre_wear_rr_pct` | 72.634 | 80.8511 | 89.425 | 0.0% |

Other columns (32): `date, source_id, bearing_vehicle_heading, longitudinal_acceleration, lateral_acceleration, yaw_rate, stopping_distance, steering_angle_sensor, steering_torque_applied, suspension_height_per_deflection, suspension_damper_force, vertical_acceleration, tyre_temp_rl_c, tyre_temp_rr_c, wheel_speed_fl_kmh, wheel_speed_fr_kmh, wheel_speed_rl_kmh, wheel_speed_rr_kmh, slip_ratio_fl, slip_ratio_fr…`

### 2.2 sim002

#### Module: `engine`
File: `synthetic_engine_inference_scenarioA_sim002.csv` | Rows: **756,000**

| span | start | end | median_dt | gap_thr | n_trips |
|------|-------|-----|-----------|---------|---------|
| 42.12d | 2024-07-05 08:00:00 | 2024-08-16 10:59:59 | 1.0s | 300s | 43 |


| Column | Min | Mean | Max | Null% |
|--------|-----|------|-----|-------|
| `engine_rpm_rpm` | 720.0 | 910.1072 | 1531.627 | 0.0% |
| `engine_load_absolute` | 5.0 | 34.4204 | 97.0 | 0.0% |

Other columns (24): `date, source_id, air_fuel_ratio_commanded_1, air_fuel_ratio_measured_1, catalyst_temperature_bank_1_sensor_1, catalyst_temperature_bank_1_sensor_2, engine_kw_at_the_wheels_kw, engine_oil_temperature, fuel_flow_rate_hour_l_hr, fuel_trim_bank_1_long_term, fuel_trim_bank_1_short_term, mass_air_flow_rate_g_s, o2_sensor1_wide_range_current_ma, o2_bank_1_sensor_2_voltage_v, timing_advance, turbo_boost_vacuum_gauge_psi, voltage_control_module_v, volumetric_efficiency_calculated, ecu_7ea_engine_coolant_temperature, ecu_7ea_intake_air_temperature…`

#### Module: `transmission`
File: `synthetic_transmission_inference_scenarioA_sim002.csv` | Rows: **756,000**

| span | start | end | median_dt | gap_thr | n_trips |
|------|-------|-----|-----------|---------|---------|
| 42.12d | 2024-07-05 08:00:00 | 2024-08-16 10:59:59 | 1.0s | 300s | 43 |


| Column | Min | Mean | Max | Null% |
|--------|-----|------|-----|-------|
| `vehicle_speed_kmh` | 0.0 | 29.2329 | 86.5693 | 0.0% |
| `gear_position_actual` | 1.0 | 2.4423 | 6.0 | 0.0% |
| `gear_commanded_target` | 1.0 | 2.4423 | 6.0 | 0.0% |
| `engine_rpm` | 720.0 | 909.9082 | 1531.1479 | 0.0% |
| `engine_load_absolute_pct` | 5.0 | 34.4315 | 97.0 | 0.0% |
| `engine_load_calculated_pct` | 5.0 | 34.4315 | 97.0 | 0.0% |
| `torque_converter_slip_speed` | 0.0 | 90.292 | 965.6242 | 0.0% |

Other columns (22): `date, source_id, transmission_oil_temperature, transmission_oil_pressure, clutch_engagement_per_slip, actual_engine_pct_torque, driver_demand_engine_pct_torque, engine_reference_torque_nm, acceleration_sensor_total_g, throttle_position_manifold_pct, accelerator_pedal_position_d_per_e_per_f_pct, air_fuel_ratio_commanded, air_fuel_ratio_measured, boost_pressure_commanded_a_per_b, boost_pressure_sensor_a_per_b, egr_commanded_pct, egr_error_pct, catalyst_temperatures_bank_sensors, bearing_heading_per_vehicle_yaw, accel_x_g…`

#### Module: `battery`
File: `synthetic_battery_inference_scenarioA_sim002.csv` | Rows: **756,000**

| span | start | end | median_dt | gap_thr | n_trips |
|------|-------|-----|-----------|---------|---------|
| 42.12d | 2024-07-05 08:00:00 | 2024-08-16 10:59:59 | 1.0s | 300s | 43 |


| Column | Min | Mean | Max | Null% |
|--------|-----|------|-----|-------|
| `battery_state_of_charge_soc_pct` | 50.0 | 52.761 | 94.231 | 0.0% |
| `battery_state_of_health_soh_pct` | 96.347 | 96.7517 | 97.156 | 0.0% |
| `battery_temperature_cell` | 34.426 | 44.7005 | 48.36 | 0.0% |
| `battery_voltage_ecu_7ee` | 24.154 | 28.0796 | 28.927 | 0.0% |

Other columns (22): `date, source_id, battery_current, hv_battery_pack_voltage, hv_battery_pack_current, internal_resistance_impedance, alternator_load_pct, alternator_voltage_output, energy_consumption_per_km_wh_per_km_per_inr_per_km, regenerative_energy_recovered, distance_to_empty_km, average_trip_speed_while_moving, average_trip_speed_overall, ambient_air_temperature, barometer_android_device_mb, engine_coolant_temperature, charging_power_kw, charging_efficiency_pct, auxiliary_12v_battery_current_draw, fuel_consumption_km_per_l_or_l_per_100_km…`

#### Module: `body`
File: `synthetic_body_inference_scenarioA_sim002.csv` | Rows: **756,000**

| span | start | end | median_dt | gap_thr | n_trips |
|------|-------|-----|-----------|---------|---------|
| 42.12d | 2024-07-05 08:00:00 | 2024-08-16 10:59:59 | 1.0s | 300s | 43 |


| Column | Min | Mean | Max | Null% |
|--------|-----|------|-----|-------|
| `fuel_level_pct` | 35.292 | 89.5741 | 100.0 | 0.0% |
| `cabin_temperature` | 18.0 | 26.4082 | 48.841 | 0.0% |
| `cabin_humidity_pct` | 18.0 | 26.4788 | 50.422 | 0.0% |
| `ac_compressor_load_pct` | 0.0 | 24.0907 | 95.0 | 0.0% |
| `odometer_reading` | 105736.0 | 109157.8293 | 111927.477 | 0.0% |

Other columns (8): `date, source_id, ambient_air_temperature_body, hvac_blower_speed, window_open_pct, sunroof_position_pct, distance_since_codes_cleared, distance_with_mil_lit`

#### Module: `tyre`
File: `synthetic_tyre_inference_scenarioA_sim002.csv` | Rows: **641,797**

| span | start | end | median_dt | gap_thr | n_trips |
|------|-------|-----|-----------|---------|---------|
| 34.09d | 2024-07-05 08:00:00 | 2024-08-08 10:16:36 | 1.0s | 300s | 35 |


| Column | Min | Mean | Max | Null% |
|--------|-----|------|-----|-------|
| `tyre_pressure_fl_psi` | 95.511 | 98.9534 | 104.21 | 0.0% |
| `tyre_pressure_fr_psi` | 95.002 | 98.3405 | 103.153 | 0.0% |
| `tyre_pressure_rl_psi` | 113.492 | 116.8414 | 120.0 | 0.0% |
| `tyre_pressure_rr_psi` | 116.146 | 118.7931 | 120.0 | 0.0% |
| `tyre_temp_fl_c` | 36.318 | 49.8348 | 68.239 | 0.0% |
| `tyre_temp_fr_c` | 40.627 | 53.6625 | 70.048 | 0.0% |
| `tyre_wear_fl_pct` | 71.563 | 80.4181 | 91.011 | 0.0% |
| `tyre_wear_fr_pct` | 49.06 | 57.9102 | 68.53 | 0.0% |
| `tyre_wear_rl_pct` | 60.891 | 68.0159 | 76.511 | 0.0% |
| `tyre_wear_rr_pct` | 79.966 | 87.0903 | 95.606 | 0.0% |

Other columns (32): `date, source_id, bearing_vehicle_heading, longitudinal_acceleration, lateral_acceleration, yaw_rate, stopping_distance, steering_angle_sensor, steering_torque_applied, suspension_height_per_deflection, suspension_damper_force, vertical_acceleration, tyre_temp_rl_c, tyre_temp_rr_c, wheel_speed_fl_kmh, wheel_speed_fr_kmh, wheel_speed_rl_kmh, wheel_speed_rr_kmh, slip_ratio_fl, slip_ratio_fr…`

### 2.3 sim003

#### Module: `engine`
File: `synthetic_engine_inference_scenarioA_sim003.csv` | Rows: **756,000**

| span | start | end | median_dt | gap_thr | n_trips |
|------|-------|-----|-----------|---------|---------|
| 42.12d | 2024-07-05 08:00:00 | 2024-08-16 10:59:59 | 1.0s | 300s | 43 |


| Column | Min | Mean | Max | Null% |
|--------|-----|------|-----|-------|
| `engine_rpm_rpm` | 720.0 | 984.6432 | 1560.8707 | 0.0% |
| `engine_load_absolute` | 5.0 | 39.713 | 97.0 | 0.0% |

Other columns (24): `date, source_id, air_fuel_ratio_commanded_1, air_fuel_ratio_measured_1, catalyst_temperature_bank_1_sensor_1, catalyst_temperature_bank_1_sensor_2, engine_kw_at_the_wheels_kw, engine_oil_temperature, fuel_flow_rate_hour_l_hr, fuel_trim_bank_1_long_term, fuel_trim_bank_1_short_term, mass_air_flow_rate_g_s, o2_sensor1_wide_range_current_ma, o2_bank_1_sensor_2_voltage_v, timing_advance, turbo_boost_vacuum_gauge_psi, voltage_control_module_v, volumetric_efficiency_calculated, ecu_7ea_engine_coolant_temperature, ecu_7ea_intake_air_temperature…`

#### Module: `transmission`
File: `synthetic_transmission_inference_scenarioA_sim003.csv` | Rows: **756,000**

| span | start | end | median_dt | gap_thr | n_trips |
|------|-------|-----|-----------|---------|---------|
| 42.12d | 2024-07-05 08:00:00 | 2024-08-16 10:59:59 | 1.0s | 300s | 43 |


| Column | Min | Mean | Max | Null% |
|--------|-----|------|-----|-------|
| `vehicle_speed_kmh` | 0.0 | 41.1727 | 86.7313 | 0.0% |
| `gear_position_actual` | 1.0 | 3.1299 | 6.0 | 0.0% |
| `gear_commanded_target` | 1.0 | 3.1299 | 6.0 | 0.0% |
| `engine_rpm` | 720.0 | 984.7111 | 1568.8547 | 0.0% |
| `engine_load_absolute_pct` | 5.0 | 39.6934 | 97.0 | 0.0% |
| `engine_load_calculated_pct` | 5.0 | 39.6934 | 97.0 | 0.0% |
| `torque_converter_slip_speed` | 0.0 | 89.4264 | 959.8906 | 0.0% |

Other columns (22): `date, source_id, transmission_oil_temperature, transmission_oil_pressure, clutch_engagement_per_slip, actual_engine_pct_torque, driver_demand_engine_pct_torque, engine_reference_torque_nm, acceleration_sensor_total_g, throttle_position_manifold_pct, accelerator_pedal_position_d_per_e_per_f_pct, air_fuel_ratio_commanded, air_fuel_ratio_measured, boost_pressure_commanded_a_per_b, boost_pressure_sensor_a_per_b, egr_commanded_pct, egr_error_pct, catalyst_temperatures_bank_sensors, bearing_heading_per_vehicle_yaw, accel_x_g…`

#### Module: `battery`
File: `synthetic_battery_inference_scenarioA_sim003.csv` | Rows: **756,000**

| span | start | end | median_dt | gap_thr | n_trips |
|------|-------|-----|-----------|---------|---------|
| 42.12d | 2024-07-05 08:00:00 | 2024-08-16 10:59:59 | 1.0s | 300s | 43 |


| Column | Min | Mean | Max | Null% |
|--------|-----|------|-----|-------|
| `battery_state_of_charge_soc_pct` | 50.0 | 52.7113 | 91.676 | 0.0% |
| `battery_state_of_health_soh_pct` | 96.512 | 96.916 | 97.32 | 0.0% |
| `battery_temperature_cell` | 29.959 | 40.511 | 44.172 | 0.0% |
| `battery_voltage_ecu_7ee` | 24.134 | 28.1112 | 28.914 | 0.0% |

Other columns (22): `date, source_id, battery_current, hv_battery_pack_voltage, hv_battery_pack_current, internal_resistance_impedance, alternator_load_pct, alternator_voltage_output, energy_consumption_per_km_wh_per_km_per_inr_per_km, regenerative_energy_recovered, distance_to_empty_km, average_trip_speed_while_moving, average_trip_speed_overall, ambient_air_temperature, barometer_android_device_mb, engine_coolant_temperature, charging_power_kw, charging_efficiency_pct, auxiliary_12v_battery_current_draw, fuel_consumption_km_per_l_or_l_per_100_km…`

#### Module: `body`
File: `synthetic_body_inference_scenarioA_sim003.csv` | Rows: **756,000**

| span | start | end | median_dt | gap_thr | n_trips |
|------|-------|-----|-----------|---------|---------|
| 42.12d | 2024-07-05 08:00:00 | 2024-08-16 10:59:59 | 1.0s | 300s | 43 |


| Column | Min | Mean | Max | Null% |
|--------|-----|------|-----|-------|
| `fuel_level_pct` | 44.707 | 85.0682 | 100.0 | 0.0% |
| `cabin_temperature` | 18.0 | 24.2457 | 45.558 | 0.0% |
| `cabin_humidity_pct` | 18.0 | 31.9018 | 58.015 | 0.0% |
| `ac_compressor_load_pct` | 0.0 | 23.464 | 95.0 | 0.0% |
| `odometer_reading` | 80248.0 | 85096.3033 | 88974.241 | 0.0% |

Other columns (8): `date, source_id, ambient_air_temperature_body, hvac_blower_speed, window_open_pct, sunroof_position_pct, distance_since_codes_cleared, distance_with_mil_lit`

#### Module: `tyre`
File: `synthetic_tyre_inference_scenarioA_sim003.csv` | Rows: **641,797**

| span | start | end | median_dt | gap_thr | n_trips |
|------|-------|-----|-----------|---------|---------|
| 34.09d | 2024-07-05 08:00:00 | 2024-08-08 10:16:36 | 1.0s | 300s | 35 |


| Column | Min | Mean | Max | Null% |
|--------|-----|------|-----|-------|
| `tyre_pressure_fl_psi` | 88.231 | 92.572 | 96.695 | 0.0% |
| `tyre_pressure_fr_psi` | 84.232 | 88.5456 | 93.017 | 0.0% |
| `tyre_pressure_rl_psi` | 106.178 | 110.4173 | 114.546 | 0.0% |
| `tyre_pressure_rr_psi` | 108.48 | 112.7989 | 117.275 | 0.0% |
| `tyre_temp_fl_c` | 45.14 | 63.0523 | 75.932 | 0.0% |
| `tyre_temp_fr_c` | 39.333 | 56.8847 | 71.346 | 0.0% |
| `tyre_wear_fl_pct` | 44.575 | 58.7384 | 73.583 | 0.0% |
| `tyre_wear_fr_pct` | 43.869 | 58.0383 | 72.904 | 0.0% |
| `tyre_wear_rl_pct` | 46.173 | 57.5404 | 69.425 | 0.0% |
| `tyre_wear_rr_pct` | 55.82 | 67.1818 | 79.065 | 0.0% |

Other columns (32): `date, source_id, bearing_vehicle_heading, longitudinal_acceleration, lateral_acceleration, yaw_rate, stopping_distance, steering_angle_sensor, steering_torque_applied, suspension_height_per_deflection, suspension_damper_force, vertical_acceleration, tyre_temp_rl_c, tyre_temp_rr_c, wheel_speed_fl_kmh, wheel_speed_fr_kmh, wheel_speed_rl_kmh, wheel_speed_rr_kmh, slip_ratio_fl, slip_ratio_fr…`

### 2.4 sim007

#### Module: `engine`
File: `synthetic_engine_inference_scenarioA_sim007.csv` | Rows: **756,000**

| span | start | end | median_dt | gap_thr | n_trips |
|------|-------|-----|-----------|---------|---------|
| 42.12d | 2024-07-05 08:00:00 | 2024-08-16 10:59:59 | 1.0s | 300s | 43 |


| Column | Min | Mean | Max | Null% |
|--------|-----|------|-----|-------|
| `engine_rpm_rpm` | 720.0 | 955.1724 | 1531.865 | 0.0% |
| `engine_load_absolute` | 5.0 | 37.6805 | 97.0 | 0.0% |

Other columns (24): `date, source_id, air_fuel_ratio_commanded_1, air_fuel_ratio_measured_1, catalyst_temperature_bank_1_sensor_1, catalyst_temperature_bank_1_sensor_2, engine_kw_at_the_wheels_kw, engine_oil_temperature, fuel_flow_rate_hour_l_hr, fuel_trim_bank_1_long_term, fuel_trim_bank_1_short_term, mass_air_flow_rate_g_s, o2_sensor1_wide_range_current_ma, o2_bank_1_sensor_2_voltage_v, timing_advance, turbo_boost_vacuum_gauge_psi, voltage_control_module_v, volumetric_efficiency_calculated, ecu_7ea_engine_coolant_temperature, ecu_7ea_intake_air_temperature…`

#### Module: `transmission`
File: `synthetic_transmission_inference_scenarioA_sim007.csv` | Rows: **756,000**

| span | start | end | median_dt | gap_thr | n_trips |
|------|-------|-----|-----------|---------|---------|
| 42.12d | 2024-07-05 08:00:00 | 2024-08-16 10:59:59 | 1.0s | 300s | 43 |


| Column | Min | Mean | Max | Null% |
|--------|-----|------|-----|-------|
| `vehicle_speed_kmh` | 0.0 | 36.5603 | 86.4269 | 0.0% |
| `gear_position_actual` | 1.0 | 2.8662 | 6.0 | 0.0% |
| `gear_commanded_target` | 1.0 | 2.8662 | 6.0 | 0.0% |
| `engine_rpm` | 720.0 | 955.5431 | 1549.9165 | 0.0% |
| `engine_load_absolute_pct` | 5.0 | 37.7062 | 97.0 | 0.0% |
| `engine_load_calculated_pct` | 5.0 | 37.7062 | 97.0 | 0.0% |
| `torque_converter_slip_speed` | 0.0 | 90.1999 | 967.1965 | 0.0% |

Other columns (22): `date, source_id, transmission_oil_temperature, transmission_oil_pressure, clutch_engagement_per_slip, actual_engine_pct_torque, driver_demand_engine_pct_torque, engine_reference_torque_nm, acceleration_sensor_total_g, throttle_position_manifold_pct, accelerator_pedal_position_d_per_e_per_f_pct, air_fuel_ratio_commanded, air_fuel_ratio_measured, boost_pressure_commanded_a_per_b, boost_pressure_sensor_a_per_b, egr_commanded_pct, egr_error_pct, catalyst_temperatures_bank_sensors, bearing_heading_per_vehicle_yaw, accel_x_g…`

#### Module: `battery`
File: `synthetic_battery_inference_scenarioA_sim007.csv` | Rows: **756,000**

| span | start | end | median_dt | gap_thr | n_trips |
|------|-------|-----|-----------|---------|---------|
| 42.12d | 2024-07-05 08:00:00 | 2024-08-16 10:59:59 | 1.0s | 300s | 43 |


| Column | Min | Mean | Max | Null% |
|--------|-----|------|-----|-------|
| `battery_state_of_charge_soc_pct` | 50.0 | 52.6775 | 90.746 | 0.0% |
| `battery_state_of_health_soh_pct` | 73.407 | 73.8119 | 74.216 | 0.0% |
| `battery_temperature_cell` | 32.885 | 43.1518 | 46.646 | 0.0% |
| `battery_voltage_ecu_7ee` | 24.165 | 28.1028 | 28.953 | 0.0% |

Other columns (22): `date, source_id, battery_current, hv_battery_pack_voltage, hv_battery_pack_current, internal_resistance_impedance, alternator_load_pct, alternator_voltage_output, energy_consumption_per_km_wh_per_km_per_inr_per_km, regenerative_energy_recovered, distance_to_empty_km, average_trip_speed_while_moving, average_trip_speed_overall, ambient_air_temperature, barometer_android_device_mb, engine_coolant_temperature, charging_power_kw, charging_efficiency_pct, auxiliary_12v_battery_current_draw, fuel_consumption_km_per_l_or_l_per_100_km…`

#### Module: `body`
File: `synthetic_body_inference_scenarioA_sim007.csv` | Rows: **756,000**

| span | start | end | median_dt | gap_thr | n_trips |
|------|-------|-----|-----------|---------|---------|
| 42.12d | 2024-07-05 08:00:00 | 2024-08-16 10:59:59 | 1.0s | 300s | 43 |


| Column | Min | Mean | Max | Null% |
|--------|-----|------|-----|-------|
| `fuel_level_pct` | 30.522 | 86.0169 | 100.0 | 0.0% |
| `cabin_temperature` | 18.0 | 35.9754 | 53.799 | 0.0% |
| `cabin_humidity_pct` | 57.034 | 58.8297 | 60.941 | 0.0% |
| `ac_compressor_load_pct` | 0.0 | 0.0 | 0.0 | 0.0% |
| `odometer_reading` | 119277.0 | 123199.8822 | 127027.4 | 0.0% |

Other columns (8): `date, source_id, ambient_air_temperature_body, hvac_blower_speed, window_open_pct, sunroof_position_pct, distance_since_codes_cleared, distance_with_mil_lit`

#### Module: `tyre`
File: `synthetic_tyre_inference_scenarioA_sim007.csv` | Rows: **641,797**

| span | start | end | median_dt | gap_thr | n_trips |
|------|-------|-----|-----------|---------|---------|
| 34.09d | 2024-07-05 08:00:00 | 2024-08-08 10:16:36 | 1.0s | 300s | 35 |


| Column | Min | Mean | Max | Null% |
|--------|-----|------|-----|-------|
| `tyre_pressure_fl_psi` | 82.218 | 85.9441 | 90.389 | 0.0% |
| `tyre_pressure_fr_psi` | 83.624 | 87.3608 | 91.584 | 0.0% |
| `tyre_pressure_rl_psi` | 105.557 | 109.5603 | 113.881 | 0.0% |
| `tyre_pressure_rr_psi` | 105.294 | 109.3924 | 113.492 | 0.0% |
| `tyre_temp_fl_c` | 44.175 | 59.3951 | 73.633 | 0.0% |
| `tyre_temp_fr_c` | 46.381 | 61.1767 | 74.409 | 0.0% |
| `tyre_wear_fl_pct` | 67.532 | 79.7975 | 91.605 | 0.0% |
| `tyre_wear_fr_pct` | 54.052 | 66.3384 | 78.139 | 0.0% |
| `tyre_wear_rl_pct` | 74.831 | 84.665 | 94.133 | 0.0% |
| `tyre_wear_rr_pct` | 59.346 | 69.1864 | 78.64 | 0.0% |

Other columns (32): `date, source_id, bearing_vehicle_heading, longitudinal_acceleration, lateral_acceleration, yaw_rate, stopping_distance, steering_angle_sensor, steering_torque_applied, suspension_height_per_deflection, suspension_damper_force, vertical_acceleration, tyre_temp_rl_c, tyre_temp_rr_c, wheel_speed_fl_kmh, wheel_speed_fr_kmh, wheel_speed_rl_kmh, wheel_speed_rr_kmh, slip_ratio_fl, slip_ratio_fr…`

### 2.5 sim008

#### Module: `engine`
File: `synthetic_engine_inference_scenarioA_sim008.csv` | Rows: **756,000**

| span | start | end | median_dt | gap_thr | n_trips |
|------|-------|-----|-----------|---------|---------|
| 42.12d | 2024-07-05 08:00:00 | 2024-08-16 10:59:59 | 1.0s | 300s | 43 |


| Column | Min | Mean | Max | Null% |
|--------|-----|------|-----|-------|
| `engine_rpm_rpm` | 720.0 | 964.1496 | 1521.9958 | 0.0% |
| `engine_load_absolute` | 5.0 | 38.3216 | 97.0 | 0.0% |

Other columns (24): `date, source_id, air_fuel_ratio_commanded_1, air_fuel_ratio_measured_1, catalyst_temperature_bank_1_sensor_1, catalyst_temperature_bank_1_sensor_2, engine_kw_at_the_wheels_kw, engine_oil_temperature, fuel_flow_rate_hour_l_hr, fuel_trim_bank_1_long_term, fuel_trim_bank_1_short_term, mass_air_flow_rate_g_s, o2_sensor1_wide_range_current_ma, o2_bank_1_sensor_2_voltage_v, timing_advance, turbo_boost_vacuum_gauge_psi, voltage_control_module_v, volumetric_efficiency_calculated, ecu_7ea_engine_coolant_temperature, ecu_7ea_intake_air_temperature…`

#### Module: `transmission`
File: `synthetic_transmission_inference_scenarioA_sim008.csv` | Rows: **756,000**

| span | start | end | median_dt | gap_thr | n_trips |
|------|-------|-----|-----------|---------|---------|
| 42.12d | 2024-07-05 08:00:00 | 2024-08-16 10:59:59 | 1.0s | 300s | 43 |


| Column | Min | Mean | Max | Null% |
|--------|-----|------|-----|-------|
| `vehicle_speed_kmh` | 0.0 | 38.064 | 86.4112 | 0.0% |
| `gear_position_actual` | 1.0 | 2.9541 | 6.0 | 0.0% |
| `gear_commanded_target` | 1.0 | 2.9541 | 6.0 | 0.0% |
| `engine_rpm` | 720.0 | 964.1381 | 1572.2438 | 0.0% |
| `engine_load_absolute_pct` | 5.0 | 38.3241 | 97.0 | 0.0% |
| `engine_load_calculated_pct` | 5.0 | 38.3241 | 97.0 | 0.0% |
| `torque_converter_slip_speed` | 0.0 | 89.6804 | 958.7276 | 0.0% |

Other columns (22): `date, source_id, transmission_oil_temperature, transmission_oil_pressure, clutch_engagement_per_slip, actual_engine_pct_torque, driver_demand_engine_pct_torque, engine_reference_torque_nm, acceleration_sensor_total_g, throttle_position_manifold_pct, accelerator_pedal_position_d_per_e_per_f_pct, air_fuel_ratio_commanded, air_fuel_ratio_measured, boost_pressure_commanded_a_per_b, boost_pressure_sensor_a_per_b, egr_commanded_pct, egr_error_pct, catalyst_temperatures_bank_sensors, bearing_heading_per_vehicle_yaw, accel_x_g…`

#### Module: `battery`
File: `synthetic_battery_inference_scenarioA_sim008.csv` | Rows: **756,000**

| span | start | end | median_dt | gap_thr | n_trips |
|------|-------|-----|-----------|---------|---------|
| 42.12d | 2024-07-05 08:00:00 | 2024-08-16 10:59:59 | 1.0s | 300s | 43 |


| Column | Min | Mean | Max | Null% |
|--------|-----|------|-----|-------|
| `battery_state_of_charge_soc_pct` | 50.0 | 52.5943 | 87.827 | 0.0% |
| `battery_state_of_health_soh_pct` | 77.691 | 78.0953 | 78.5 | 0.0% |
| `battery_temperature_cell` | 34.733 | 45.2293 | 48.698 | 0.0% |
| `battery_voltage_ecu_7ee` | 24.157 | 28.1076 | 28.865 | 0.0% |

Other columns (22): `date, source_id, battery_current, hv_battery_pack_voltage, hv_battery_pack_current, internal_resistance_impedance, alternator_load_pct, alternator_voltage_output, energy_consumption_per_km_wh_per_km_per_inr_per_km, regenerative_energy_recovered, distance_to_empty_km, average_trip_speed_while_moving, average_trip_speed_overall, ambient_air_temperature, barometer_android_device_mb, engine_coolant_temperature, charging_power_kw, charging_efficiency_pct, auxiliary_12v_battery_current_draw, fuel_consumption_km_per_l_or_l_per_100_km…`

#### Module: `body`
File: `synthetic_body_inference_scenarioA_sim008.csv` | Rows: **756,000**

| span | start | end | median_dt | gap_thr | n_trips |
|------|-------|-----|-----------|---------|---------|
| 42.12d | 2024-07-05 08:00:00 | 2024-08-16 10:59:59 | 1.0s | 300s | 43 |


| Column | Min | Mean | Max | Null% |
|--------|-----|------|-----|-------|
| `fuel_level_pct` | 38.901 | 86.4575 | 100.0 | 0.0% |
| `cabin_temperature` | 18.0 | 23.904 | 42.983 | 0.0% |
| `cabin_humidity_pct` | 18.0 | 27.2675 | 52.084 | 0.0% |
| `ac_compressor_load_pct` | 0.0 | 23.8503 | 95.0 | 0.0% |
| `odometer_reading` | 118195.0 | 122488.4747 | 126258.736 | 0.0% |

Other columns (8): `date, source_id, ambient_air_temperature_body, hvac_blower_speed, window_open_pct, sunroof_position_pct, distance_since_codes_cleared, distance_with_mil_lit`

#### Module: `tyre`
File: `synthetic_tyre_inference_scenarioA_sim008.csv` | Rows: **641,797**

| span | start | end | median_dt | gap_thr | n_trips |
|------|-------|-----|-----------|---------|---------|
| 34.09d | 2024-07-05 08:00:00 | 2024-08-08 10:16:36 | 1.0s | 300s | 35 |


| Column | Min | Mean | Max | Null% |
|--------|-----|------|-----|-------|
| `tyre_pressure_fl_psi` | 87.234 | 91.0944 | 96.016 | 0.0% |
| `tyre_pressure_fr_psi` | 88.606 | 92.4948 | 97.198 | 0.0% |
| `tyre_pressure_rl_psi` | 109.073 | 112.7225 | 117.584 | 0.0% |
| `tyre_pressure_rr_psi` | 108.519 | 112.2473 | 116.891 | 0.0% |
| `tyre_temp_fl_c` | 38.99 | 53.7804 | 70.645 | 0.0% |
| `tyre_temp_fr_c` | 37.899 | 52.8626 | 68.735 | 0.0% |
| `tyre_wear_fl_pct` | 47.634 | 58.38 | 71.544 | 0.0% |
| `tyre_wear_fr_pct` | 66.004 | 76.7863 | 89.967 | 0.0% |
| `tyre_wear_rl_pct` | 57.15 | 65.7984 | 76.352 | 0.0% |
| `tyre_wear_rr_pct` | 51.685 | 60.3149 | 70.896 | 0.0% |

Other columns (32): `date, source_id, bearing_vehicle_heading, longitudinal_acceleration, lateral_acceleration, yaw_rate, stopping_distance, steering_angle_sensor, steering_torque_applied, suspension_height_per_deflection, suspension_damper_force, vertical_acceleration, tyre_temp_rl_c, tyre_temp_rr_c, wheel_speed_fl_kmh, wheel_speed_fr_kmh, wheel_speed_rl_kmh, wheel_speed_rr_kmh, slip_ratio_fl, slip_ratio_fr…`

### 2.6 sim009

#### Module: `engine`
File: `synthetic_engine_inference_scenarioA_sim009.csv` | Rows: **756,000**

| span | start | end | median_dt | gap_thr | n_trips |
|------|-------|-----|-----------|---------|---------|
| 42.12d | 2024-07-05 08:00:00 | 2024-08-16 10:59:59 | 1.0s | 300s | 43 |


| Column | Min | Mean | Max | Null% |
|--------|-----|------|-----|-------|
| `engine_rpm_rpm` | 720.0 | 968.5012 | 1577.4632 | 0.0% |
| `engine_load_absolute` | 5.0 | 38.5312 | 97.0 | 0.0% |

Other columns (24): `date, source_id, air_fuel_ratio_commanded_1, air_fuel_ratio_measured_1, catalyst_temperature_bank_1_sensor_1, catalyst_temperature_bank_1_sensor_2, engine_kw_at_the_wheels_kw, engine_oil_temperature, fuel_flow_rate_hour_l_hr, fuel_trim_bank_1_long_term, fuel_trim_bank_1_short_term, mass_air_flow_rate_g_s, o2_sensor1_wide_range_current_ma, o2_bank_1_sensor_2_voltage_v, timing_advance, turbo_boost_vacuum_gauge_psi, voltage_control_module_v, volumetric_efficiency_calculated, ecu_7ea_engine_coolant_temperature, ecu_7ea_intake_air_temperature…`

#### Module: `transmission`
File: `synthetic_transmission_inference_scenarioA_sim009.csv` | Rows: **756,000**

| span | start | end | median_dt | gap_thr | n_trips |
|------|-------|-----|-----------|---------|---------|
| 42.12d | 2024-07-05 08:00:00 | 2024-08-16 10:59:59 | 1.0s | 300s | 43 |


| Column | Min | Mean | Max | Null% |
|--------|-----|------|-----|-------|
| `vehicle_speed_kmh` | 0.0 | 38.5336 | 86.3522 | 0.0% |
| `gear_position_actual` | 1.0 | 2.9779 | 6.0 | 0.0% |
| `gear_commanded_target` | 1.0 | 2.9779 | 6.0 | 0.0% |
| `engine_rpm` | 720.0 | 968.8777 | 1554.9425 | 0.0% |
| `engine_load_absolute_pct` | 5.0 | 38.5252 | 97.0 | 0.0% |
| `engine_load_calculated_pct` | 5.0 | 38.5252 | 97.0 | 0.0% |
| `torque_converter_slip_speed` | 0.0 | 89.2177 | 960.9363 | 0.0% |

Other columns (22): `date, source_id, transmission_oil_temperature, transmission_oil_pressure, clutch_engagement_per_slip, actual_engine_pct_torque, driver_demand_engine_pct_torque, engine_reference_torque_nm, acceleration_sensor_total_g, throttle_position_manifold_pct, accelerator_pedal_position_d_per_e_per_f_pct, air_fuel_ratio_commanded, air_fuel_ratio_measured, boost_pressure_commanded_a_per_b, boost_pressure_sensor_a_per_b, egr_commanded_pct, egr_error_pct, catalyst_temperatures_bank_sensors, bearing_heading_per_vehicle_yaw, accel_x_g…`

#### Module: `battery`
File: `synthetic_battery_inference_scenarioA_sim009.csv` | Rows: **756,000**

| span | start | end | median_dt | gap_thr | n_trips |
|------|-------|-----|-----------|---------|---------|
| 42.12d | 2024-07-05 08:00:00 | 2024-08-16 10:59:59 | 1.0s | 300s | 43 |


| Column | Min | Mean | Max | Null% |
|--------|-----|------|-----|-------|
| `battery_state_of_charge_soc_pct` | 50.0 | 52.7275 | 92.612 | 0.0% |
| `battery_state_of_health_soh_pct` | 72.0 | 72.0633 | 72.127 | 0.0% |
| `battery_temperature_cell` | 35.006 | 45.3708 | 48.993 | 0.0% |
| `battery_voltage_ecu_7ee` | 24.159 | 28.101 | 28.879 | 0.0% |

Other columns (22): `date, source_id, battery_current, hv_battery_pack_voltage, hv_battery_pack_current, internal_resistance_impedance, alternator_load_pct, alternator_voltage_output, energy_consumption_per_km_wh_per_km_per_inr_per_km, regenerative_energy_recovered, distance_to_empty_km, average_trip_speed_while_moving, average_trip_speed_overall, ambient_air_temperature, barometer_android_device_mb, engine_coolant_temperature, charging_power_kw, charging_efficiency_pct, auxiliary_12v_battery_current_draw, fuel_consumption_km_per_l_or_l_per_100_km…`

#### Module: `body`
File: `synthetic_body_inference_scenarioA_sim009.csv` | Rows: **756,000**

| span | start | end | median_dt | gap_thr | n_trips |
|------|-------|-----|-----------|---------|---------|
| 42.12d | 2024-07-05 08:00:00 | 2024-08-16 10:59:59 | 1.0s | 300s | 43 |


| Column | Min | Mean | Max | Null% |
|--------|-----|------|-----|-------|
| `fuel_level_pct` | 44.655 | 86.6848 | 100.0 | 0.0% |
| `cabin_temperature` | 18.0 | 26.3109 | 43.181 | 0.0% |
| `cabin_humidity_pct` | 18.0 | 24.407 | 46.271 | 0.0% |
| `ac_compressor_load_pct` | 0.0 | 23.2324 | 95.0 | 0.0% |
| `odometer_reading` | 73643.0 | 78047.4512 | 81810.612 | 0.0% |

Other columns (8): `date, source_id, ambient_air_temperature_body, hvac_blower_speed, window_open_pct, sunroof_position_pct, distance_since_codes_cleared, distance_with_mil_lit`

#### Module: `tyre`
File: `synthetic_tyre_inference_scenarioA_sim009.csv` | Rows: **641,797**

| span | start | end | median_dt | gap_thr | n_trips |
|------|-------|-----|-----------|---------|---------|
| 34.09d | 2024-07-05 08:00:00 | 2024-08-08 10:16:36 | 1.0s | 300s | 35 |


| Column | Min | Mean | Max | Null% |
|--------|-----|------|-----|-------|
| `tyre_pressure_fl_psi` | 93.997 | 97.7839 | 102.26 | 0.0% |
| `tyre_pressure_fr_psi` | 93.339 | 97.3128 | 101.703 | 0.0% |
| `tyre_pressure_rl_psi` | 112.122 | 116.3789 | 120.0 | 0.0% |
| `tyre_pressure_rr_psi` | 106.95 | 111.1321 | 115.719 | 0.0% |
| `tyre_temp_fl_c` | 42.951 | 58.1366 | 73.086 | 0.0% |
| `tyre_temp_fr_c` | 39.544 | 54.8023 | 69.362 | 0.0% |
| `tyre_wear_fl_pct` | 51.272 | 62.7468 | 76.201 | 0.0% |
| `tyre_wear_fr_pct` | 45.534 | 57.0354 | 70.517 | 0.0% |
| `tyre_wear_rl_pct` | 75.494 | 84.7189 | 95.531 | 0.0% |
| `tyre_wear_rr_pct` | 53.133 | 62.3449 | 73.159 | 0.0% |

Other columns (32): `date, source_id, bearing_vehicle_heading, longitudinal_acceleration, lateral_acceleration, yaw_rate, stopping_distance, steering_angle_sensor, steering_torque_applied, suspension_height_per_deflection, suspension_damper_force, vertical_acceleration, tyre_temp_rl_c, tyre_temp_rr_c, wheel_speed_fl_kmh, wheel_speed_fr_kmh, wheel_speed_rl_kmh, wheel_speed_rr_kmh, slip_ratio_fl, slip_ratio_fr…`

### 2.7 sim010

#### Module: `engine`
File: `synthetic_engine_inference_scenarioA_sim010.csv` | Rows: **756,000**

| span | start | end | median_dt | gap_thr | n_trips |
|------|-------|-----|-----------|---------|---------|
| 42.12d | 2024-07-05 08:00:00 | 2024-08-16 10:59:59 | 1.0s | 300s | 43 |


| Column | Min | Mean | Max | Null% |
|--------|-----|------|-----|-------|
| `engine_rpm_rpm` | 720.0 | 961.9957 | 1539.6151 | 0.0% |
| `engine_load_absolute` | 5.0 | 38.1173 | 97.0 | 0.0% |

Other columns (24): `date, source_id, air_fuel_ratio_commanded_1, air_fuel_ratio_measured_1, catalyst_temperature_bank_1_sensor_1, catalyst_temperature_bank_1_sensor_2, engine_kw_at_the_wheels_kw, engine_oil_temperature, fuel_flow_rate_hour_l_hr, fuel_trim_bank_1_long_term, fuel_trim_bank_1_short_term, mass_air_flow_rate_g_s, o2_sensor1_wide_range_current_ma, o2_bank_1_sensor_2_voltage_v, timing_advance, turbo_boost_vacuum_gauge_psi, voltage_control_module_v, volumetric_efficiency_calculated, ecu_7ea_engine_coolant_temperature, ecu_7ea_intake_air_temperature…`

#### Module: `transmission`
File: `synthetic_transmission_inference_scenarioA_sim010.csv` | Rows: **756,000**

| span | start | end | median_dt | gap_thr | n_trips |
|------|-------|-----|-----------|---------|---------|
| 42.12d | 2024-07-05 08:00:00 | 2024-08-16 10:59:59 | 1.0s | 300s | 43 |


| Column | Min | Mean | Max | Null% |
|--------|-----|------|-----|-------|
| `vehicle_speed_kmh` | 0.0 | 37.5603 | 86.4589 | 0.0% |
| `gear_position_actual` | 1.0 | 2.9211 | 6.0 | 0.0% |
| `gear_commanded_target` | 1.0 | 2.9211 | 6.0 | 0.0% |
| `engine_rpm` | 720.0 | 961.7915 | 1522.3585 | 0.0% |
| `engine_load_absolute_pct` | 5.0 | 38.1388 | 97.0 | 0.0% |
| `engine_load_calculated_pct` | 5.0 | 38.1388 | 97.0 | 0.0% |
| `torque_converter_slip_speed` | 0.0 | 89.8444 | 962.426 | 0.0% |

Other columns (22): `date, source_id, transmission_oil_temperature, transmission_oil_pressure, clutch_engagement_per_slip, actual_engine_pct_torque, driver_demand_engine_pct_torque, engine_reference_torque_nm, acceleration_sensor_total_g, throttle_position_manifold_pct, accelerator_pedal_position_d_per_e_per_f_pct, air_fuel_ratio_commanded, air_fuel_ratio_measured, boost_pressure_commanded_a_per_b, boost_pressure_sensor_a_per_b, egr_commanded_pct, egr_error_pct, catalyst_temperatures_bank_sensors, bearing_heading_per_vehicle_yaw, accel_x_g…`

#### Module: `battery`
File: `synthetic_battery_inference_scenarioA_sim010.csv` | Rows: **756,000**

| span | start | end | median_dt | gap_thr | n_trips |
|------|-------|-----|-----------|---------|---------|
| 42.12d | 2024-07-05 08:00:00 | 2024-08-16 10:59:59 | 1.0s | 300s | 43 |


| Column | Min | Mean | Max | Null% |
|--------|-----|------|-----|-------|
| `battery_state_of_charge_soc_pct` | 50.0 | 52.5388 | 85.973 | 0.0% |
| `battery_state_of_health_soh_pct` | 80.882 | 81.2866 | 81.691 | 0.0% |
| `battery_temperature_cell` | 38.324 | 48.6794 | 52.227 | 0.0% |
| `battery_voltage_ecu_7ee` | 24.177 | 28.1024 | 28.895 | 0.0% |

Other columns (22): `date, source_id, battery_current, hv_battery_pack_voltage, hv_battery_pack_current, internal_resistance_impedance, alternator_load_pct, alternator_voltage_output, energy_consumption_per_km_wh_per_km_per_inr_per_km, regenerative_energy_recovered, distance_to_empty_km, average_trip_speed_while_moving, average_trip_speed_overall, ambient_air_temperature, barometer_android_device_mb, engine_coolant_temperature, charging_power_kw, charging_efficiency_pct, auxiliary_12v_battery_current_draw, fuel_consumption_km_per_l_or_l_per_100_km…`

#### Module: `body`
File: `synthetic_body_inference_scenarioA_sim010.csv` | Rows: **756,000**

| span | start | end | median_dt | gap_thr | n_trips |
|------|-------|-----|-----------|---------|---------|
| 42.12d | 2024-07-05 08:00:00 | 2024-08-16 10:59:59 | 1.0s | 300s | 43 |


| Column | Min | Mean | Max | Null% |
|--------|-----|------|-----|-------|
| `fuel_level_pct` | 34.785 | 85.7139 | 100.0 | 0.0% |
| `cabin_temperature` | 18.0 | 24.8606 | 42.465 | 0.0% |
| `cabin_humidity_pct` | 18.0 | 34.9582 | 60.318 | 0.0% |
| `ac_compressor_load_pct` | 0.0 | 22.3097 | 95.0 | 0.0% |
| `odometer_reading` | 88033.0 | 92154.5256 | 95990.593 | 0.0% |

Other columns (8): `date, source_id, ambient_air_temperature_body, hvac_blower_speed, window_open_pct, sunroof_position_pct, distance_since_codes_cleared, distance_with_mil_lit`

#### Module: `tyre`
File: `synthetic_tyre_inference_scenarioA_sim010.csv` | Rows: **641,797**

| span | start | end | median_dt | gap_thr | n_trips |
|------|-------|-----|-----------|---------|---------|
| 34.09d | 2024-07-05 08:00:00 | 2024-08-08 10:16:36 | 1.0s | 300s | 35 |


| Column | Min | Mean | Max | Null% |
|--------|-----|------|-----|-------|
| `tyre_pressure_fl_psi` | 85.488 | 89.3501 | 93.656 | 0.0% |
| `tyre_pressure_fr_psi` | 86.521 | 90.3905 | 94.897 | 0.0% |
| `tyre_pressure_rl_psi` | 96.767 | 100.6893 | 105.094 | 0.0% |
| `tyre_pressure_rr_psi` | 98.98 | 103.1701 | 107.776 | 0.0% |
| `tyre_temp_fl_c` | 39.187 | 53.9116 | 68.338 | 0.0% |
| `tyre_temp_fr_c` | 45.684 | 60.4408 | 75.781 | 0.0% |
| `tyre_wear_fl_pct` | 66.598 | 78.3335 | 90.775 | 0.0% |
| `tyre_wear_fr_pct` | 53.969 | 65.6914 | 78.122 | 0.0% |
| `tyre_wear_rl_pct` | 68.357 | 77.7807 | 87.755 | 0.0% |
| `tyre_wear_rr_pct` | 75.932 | 85.3438 | 95.314 | 0.0% |

Other columns (32): `date, source_id, bearing_vehicle_heading, longitudinal_acceleration, lateral_acceleration, yaw_rate, stopping_distance, steering_angle_sensor, steering_torque_applied, suspension_height_per_deflection, suspension_damper_force, vertical_acceleration, tyre_temp_rl_c, tyre_temp_rr_c, wheel_speed_fl_kmh, wheel_speed_fr_kmh, wheel_speed_rl_kmh, wheel_speed_rr_kmh, slip_ratio_fl, slip_ratio_fr…`

---

## 3. Expansion Blueprint: 7 → 40 Vehicles

### 3.1 Current State
- 7 real vehicle CSVs, each with 5 module files
- Each vehicle has a `sim_id` (e.g. `sim001`, `sim002`)
- All fix_* scripts are deterministic on `sim_id`
- Scripts accept `--root` flag for running on any device

### 3.2 Date-Cut Strategy
```
Each real vehicle has N days of 1s-resolution data.
Cut strategy: split each vehicle's CSV into multiple non-overlapping date windows.

Example with 7 vehicles × 5 cuts = 35 new vehicles (+ 5 more from overlap):
  sim001_A: 2025-01-01 to 2025-01-14   (new sim_id = 'v001a')
  sim001_B: 2025-01-15 to 2025-01-28   (new sim_id = 'v001b')
  ...etc

The cut script:
  1. Reads original CSV
  2. Filters by date range
  3. Writes to data/vehicles/<new_sim_id>/<original_filename>
  4. fix_* scripts run on the new directory with the new sim_id
     → different RNG seed → different gear noise, different tyre wear start, etc.
     but same physical relationships (speed drives everything)
```

### 3.3 New sim_id Naming Convention
```
Original: sim001 … sim007
Cuts:     v01a, v01b, v01c, v01d, v01e
          v02a, v02b, v02c, v02d, v02e
          ...  (7 × 5 = 35) + 5 from partial cuts = 40

RNG guarantee: sha256('v01a:fuel_start') ≠ sha256('v01b:fuel_start')
→ each cut vehicle gets fully independent starting conditions.
```

### 3.4 What the Cut Script Needs to Know
Provide in the next session:
- [ ] Exact column name for timestamp
- [ ] Date range available per vehicle
- [ ] Whether all 7 vehicles have the same date range
- [ ] Target number of vehicles (confirming 40)
- [ ] Directory structure of the bigger data (flat or nested?)
- [ ] Whether module CSVs are in sub-folders or same folder per vehicle

### 3.5 Script to Write Next
```
expand_vehicles.py  --source-root <demo_data>  --out-root <new_data>
  --n-cuts 5          # cuts per vehicle
  --window-days 14    # or auto-computed from date range
  --yes               # skip confirmation

After running, execute fix_* scripts on new root:
  python fix_vehicle_physics.py --root <new_data>  --yes
  python fix_battery_physics.py --root <new_data>  --yes
  python fix_cabin_physics.py   --root <new_data>  --yes
  python fix_tyre_physics.py    --root <new_data>  --yes
  python fix_mileage.py         --root <new_data>  --yes
```

---

## 4. Fill-in Section (Demo Device)

When running on the demo device, Section 2 above will be auto-filled.
Additionally, please manually note:

```
Demo device OS          : ___
Python version          : ___
Data root path          : ___
Total vehicles          : ___
Approx rows per vehicle : ___
Date range              : ___ to ___
Timestamp column name   : ___
Timestamp format        : ___  (e.g. '2025-01-01 00:00:01+00:00' or unix seconds)
Row interval (confirm)  : ___ seconds
Source_id column        : ___  (or is it embedded in filename?)
Module CSV location     : inside sim folder / separate folders / flat
Any columns MISSING from fix_* target list (not in real data): ___
Any columns in real data not in fix_* scripts (new signals):   ___
```
