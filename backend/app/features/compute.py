"""Feature computation functions.

Each function takes a list of RobotData rows (one robot, ordered by timestamp)
and returns a list of dicts ready for bulk insert into robot_features.
"""


def _group_consecutive(rows, predicate):
    """Yield (start_time, end_time) for consecutive runs where predicate(row) is True."""
    in_segment = False
    start = None
    prev_ts = None

    for row in rows:
        if predicate(row):
            if not in_segment:
                start = row.timestamp
                in_segment = True
            prev_ts = row.timestamp
        else:
            if in_segment:
                yield (start, prev_ts)
                in_segment = False
                start = None

    if in_segment:
        yield (start, prev_ts)


def compute_error_code_occurrence(rows, robot_id, file_id):
    """Points where error_code is not None."""
    results = []
    for row in rows:
        if row.error_code:
            results.append({
                "file_id": file_id,
                "robot_id": robot_id,
                "feature_key": "error_code.occurrence",
                "shape": "point",
                "start_time": row.timestamp,
                "end_time": None,
                "metadata_json": f'{{"error_code": "{row.error_code}"}}',
            })
    return results


def compute_battery_device_compound(rows, robot_id, file_id):
    """Segments where battery < 20% AND (device_a or device_b = 'error')."""
    def pred(row):
        return (
            row.battery_level < 20
            and (row.device_a_status == "error" or row.device_b_status == "error")
        )

    results = []
    for start, end in _group_consecutive(rows, pred):
        results.append({
            "file_id": file_id,
            "robot_id": robot_id,
            "feature_key": "battery_device.compound_alert",
            "shape": "segment",
            "start_time": start,
            "end_time": end,
            "metadata_json": None,
        })
    return results


def compute_speed_idle(rows, robot_id, file_id):
    """Segments where speed = 0."""
    results = []
    for start, end in _group_consecutive(rows, lambda r: r.speed == 0):
        # Only include if the segment spans more than one data point
        if start != end:
            results.append({
                "file_id": file_id,
                "robot_id": robot_id,
                "feature_key": "speed.idle",
                "shape": "segment",
                "start_time": start,
                "end_time": end,
                "metadata_json": None,
            })
    return results


def compute_device_error_segments(rows, robot_id, file_id, device):
    """Segments where device_X_status = 'error'."""
    attr = f"device_{device}_status"
    key = f"device_{device}.error_segments"

    results = []
    for start, end in _group_consecutive(rows, lambda r: getattr(r, attr) == "error"):
        results.append({
            "file_id": file_id,
            "robot_id": robot_id,
            "feature_key": key,
            "shape": "segment",
            "start_time": start,
            "end_time": end,
            "metadata_json": None,
        })
    return results


def compute_battery_critical(rows, robot_id, file_id):
    """Segments where battery < 10%."""
    results = []
    for start, end in _group_consecutive(rows, lambda r: r.battery_level < 10):
        results.append({
            "file_id": file_id,
            "robot_id": robot_id,
            "feature_key": "battery.critical",
            "shape": "segment",
            "start_time": start,
            "end_time": end,
            "metadata_json": None,
        })
    return results


def compute_speed_rapid_drop(rows, robot_id, file_id):
    """Segments where speed drops > 50% within a 5-second window.

    Algorithm: sliding window — for each row, look back up to 5 seconds.
    If max speed in that window is > 2x current speed, mark as rapid drop.
    Group consecutive drops into segments.
    """
    if len(rows) < 2:
        return []

    # Build a flag array
    drop_flags = [False] * len(rows)

    for i in range(1, len(rows)):
        current_speed = rows[i].speed
        current_ts = rows[i].timestamp.timestamp()

        # Look back up to 5 seconds
        max_prev = current_speed
        j = i - 1
        while j >= 0 and (current_ts - rows[j].timestamp.timestamp()) <= 5.0:
            if rows[j].speed > max_prev:
                max_prev = rows[j].speed
            j -= 1

        # Speed dropped > 50% from recent max (only if max was meaningful)
        if max_prev > 0.5 and current_speed < max_prev * 0.5:
            drop_flags[i] = True

    # Group consecutive True flags into segments
    results = []
    in_segment = False
    start = None
    prev_ts = None

    for i, flag in enumerate(drop_flags):
        if flag:
            if not in_segment:
                start = rows[i].timestamp
                in_segment = True
            prev_ts = rows[i].timestamp
        else:
            if in_segment:
                results.append({
                    "file_id": file_id,
                    "robot_id": robot_id,
                    "feature_key": "speed.rapid_drop",
                    "shape": "segment",
                    "start_time": start,
                    "end_time": prev_ts,
                    "metadata_json": None,
                })
                in_segment = False

    if in_segment:
        results.append({
            "file_id": file_id,
            "robot_id": robot_id,
            "feature_key": "speed.rapid_drop",
            "shape": "segment",
            "start_time": start,
            "end_time": prev_ts,
            "metadata_json": None,
        })

    return results


# Map feature_key → compute function(s)
SYNC_COMPUTE_MAP = {
    "error_code.occurrence": lambda rows, rid, fid: compute_error_code_occurrence(rows, rid, fid),
    "battery_device.compound_alert": lambda rows, rid, fid: compute_battery_device_compound(rows, rid, fid),
    "speed.idle": lambda rows, rid, fid: compute_speed_idle(rows, rid, fid),
    "device_a.error_segments": lambda rows, rid, fid: compute_device_error_segments(rows, rid, fid, "a"),
    "device_b.error_segments": lambda rows, rid, fid: compute_device_error_segments(rows, rid, fid, "b"),
    "battery.critical": lambda rows, rid, fid: compute_battery_critical(rows, rid, fid),
}

ASYNC_COMPUTE_MAP = {
    "speed.rapid_drop": lambda rows, rid, fid: compute_speed_rapid_drop(rows, rid, fid),
}
