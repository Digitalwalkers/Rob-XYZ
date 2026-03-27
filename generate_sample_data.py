"""
Generate realistic 8-hour robot telemetry data at 1-second intervals.
3 robots × 28,800 seconds = 86,400 rows.
"""

import csv
import random
import math
from datetime import datetime, timedelta, timezone

random.seed(42)

OUTPUT_FILE = "sample_data.csv"
START_TIME = datetime(2024, 3, 15, 8, 0, 0, tzinfo=timezone.utc)
DURATION_SECONDS = 8 * 3600  # 8 hours
ROBOTS = ["robot_001", "robot_002", "robot_003"]

ERROR_CODES = {
    "device_a": ["E201", "E202", "E203"],
    "device_b": ["E102", "E103"],
    "both": ["E301", "E401", "E402"],
}

# Each robot has different characteristics
ROBOT_CONFIGS = {
    "robot_001": {
        "start_x": 10.5, "start_y": 20.3,
        "start_battery": 95,
        "base_speed": 1.3,
        "patrol_radius": 50,
        "fault_rate": 0.008,      # probability per second of entering a fault episode
        "battery_drain_rate": 0.0011,  # per second base drain
    },
    "robot_002": {
        "start_x": 50.0, "start_y": 40.0,
        "start_battery": 100,
        "base_speed": 1.7,
        "patrol_radius": 60,
        "fault_rate": 0.012,
        "battery_drain_rate": 0.0013,
    },
    "robot_003": {
        "start_x": 100.0, "start_y": 100.0,
        "start_battery": 88,
        "base_speed": 2.0,
        "patrol_radius": 70,
        "fault_rate": 0.006,
        "battery_drain_rate": 0.0010,
    },
}


def generate_robot_data(robot_id, config):
    """Generate 8 hours of data for one robot with realistic patterns."""
    rows = []
    x, y = config["start_x"], config["start_y"]
    battery = config["start_battery"]
    base_speed = config["base_speed"]
    center_x, center_y = x, y

    # Movement direction (angle in radians), changes smoothly
    angle = random.uniform(0, 2 * math.pi)

    # Fault state machine: "normal", "warning", "error"
    fault_state = "normal"
    fault_timer = 0          # seconds remaining in current fault episode
    fault_device = None      # "a", "b", or "both"
    current_error_code = ""

    # Charging state
    charging = False
    charge_timer = 0

    # Stopped state (occasional pauses)
    stopped = False
    stop_timer = 0

    for t in range(DURATION_SECONDS):
        ts = START_TIME + timedelta(seconds=t)
        timestamp = ts.strftime("%Y-%m-%dT%H:%M:%SZ")

        # --- Battery logic ---
        if charging:
            battery = min(100, battery + 0.05)  # charge ~18%/hr
            charge_timer -= 1
            if charge_timer <= 0 or battery >= 98:
                charging = False
        else:
            # Drain varies with speed and fault state
            drain = config["battery_drain_rate"]
            if fault_state == "error":
                drain *= 1.5
            battery = max(0, battery - drain)

            # Trigger charging when battery drops low
            if battery < 15 and not charging:
                charging = True
                charge_timer = random.randint(1200, 2400)  # 20-40 min charge

        # --- Fault state machine ---
        if fault_state == "normal" and fault_timer <= 0:
            if random.random() < config["fault_rate"]:
                # Start a fault episode
                fault_device = random.choice(["a", "b", "both"])
                # 70% chance warning only, 30% escalates to error
                if random.random() < 0.7:
                    fault_state = "warning"
                    fault_timer = random.randint(10, 120)  # 10s to 2min
                else:
                    fault_state = "warning"
                    fault_timer = random.randint(5, 30)  # brief warning before error
        elif fault_state == "warning" and fault_timer <= 0:
            # Either escalate to error or recover
            if random.random() < 0.35:
                fault_state = "error"
                fault_timer = random.randint(15, 300)  # 15s to 5min error
            else:
                fault_state = "normal"
                fault_timer = random.randint(60, 600)  # cooldown before next fault
                fault_device = None
                current_error_code = ""
        elif fault_state == "error" and fault_timer <= 0:
            # Recover from error, possibly through warning
            if random.random() < 0.5:
                fault_state = "warning"
                fault_timer = random.randint(10, 60)
            else:
                fault_state = "normal"
                fault_timer = random.randint(120, 900)
                fault_device = None
                current_error_code = ""

        if fault_timer > 0:
            fault_timer -= 1

        # Determine device statuses
        device_a_status = "ok"
        device_b_status = "ok"
        error_code = ""

        if fault_state != "normal" and fault_device:
            status_val = "warning" if fault_state == "warning" else "error"
            if fault_device == "a":
                device_a_status = status_val
                codes = ERROR_CODES["device_a"]
            elif fault_device == "b":
                device_b_status = status_val
                codes = ERROR_CODES["device_b"]
            else:  # both
                device_a_status = status_val
                device_b_status = status_val
                codes = ERROR_CODES["both"]

            # Assign error code (keep consistent within an episode)
            if not current_error_code:
                current_error_code = random.choice(codes)
            error_code = current_error_code

        # --- Movement logic ---
        # Stopped during error or charging or random pause
        if fault_state == "error" or charging:
            speed = 0.0
        elif stopped:
            speed = 0.0
            stop_timer -= 1
            if stop_timer <= 0:
                stopped = False
        else:
            # Occasional random stop
            if random.random() < 0.002:
                stopped = True
                stop_timer = random.randint(5, 60)
                speed = 0.0
            else:
                # Speed with some noise, reduced during warnings
                speed_mult = 0.6 if fault_state == "warning" else 1.0
                speed = max(0.0, base_speed * speed_mult + random.gauss(0, 0.3))
                speed = round(min(speed, 3.5), 1)

                # Smoothly adjust direction with occasional turns
                angle += random.gauss(0, 0.05)
                # Tend back toward patrol center to keep robot in area
                dx_center = center_x - x
                dy_center = center_y - y
                dist_from_center = math.sqrt(dx_center**2 + dy_center**2)
                if dist_from_center > config["patrol_radius"] * 0.7:
                    target_angle = math.atan2(dy_center, dx_center)
                    angle_diff = target_angle - angle
                    # Normalize
                    angle_diff = (angle_diff + math.pi) % (2 * math.pi) - math.pi
                    angle += angle_diff * 0.03

                x += speed * math.cos(angle)
                y += speed * math.sin(angle)

        x = round(x, 1)
        y = round(y, 1)
        speed = round(speed, 1)
        battery_level = round(battery)

        rows.append([
            robot_id, timestamp, x, y, battery_level,
            device_a_status, device_b_status, speed, error_code,
        ])

    return rows


def main():
    header = [
        "robot_id", "timestamp", "location_x", "location_y",
        "battery_level", "device_a_status", "device_b_status",
        "speed", "error_code",
    ]

    print(f"Generating {DURATION_SECONDS} seconds × {len(ROBOTS)} robots = {DURATION_SECONDS * len(ROBOTS)} rows ...")

    all_rows = []
    for robot_id in ROBOTS:
        print(f"  Generating data for {robot_id} ...")
        config = ROBOT_CONFIGS[robot_id]
        rows = generate_robot_data(robot_id, config)
        all_rows.extend(rows)

    # Sort by timestamp then robot_id for a natural ordering
    all_rows.sort(key=lambda r: (r[1], r[0]))

    with open(OUTPUT_FILE, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(header)
        writer.writerows(all_rows)

    print(f"Done! Wrote {len(all_rows)} rows to {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
