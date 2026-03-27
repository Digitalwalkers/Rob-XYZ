import asyncio
import csv
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from io import StringIO
from pathlib import Path

from sqlalchemy import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session
from app.models import UploadTask, CsvFile, RobotData, RobotSummary
from app.services.progress import progress_store
from app.features.service import compute_sync_features, launch_async_features

REQUIRED_COLUMNS = {
    "robot_id", "timestamp", "location_x", "location_y",
    "battery_level", "device_a_status", "device_b_status",
    "speed", "error_code",
}

BATCH_SIZE = 500


async def process_upload(task_id: str, file_path: str, filename: str, file_size: int):
    """Background task: validate CSV, parse data, insert into DB."""
    try:
        # --- Step 1: Validating ---
        progress_store.update(task_id, status="validating", progress=0, message="校验文件格式...")

        content = Path(file_path).read_text(encoding="utf-8")
        reader = csv.DictReader(StringIO(content))
        headers = set(reader.fieldnames or [])

        missing = REQUIRED_COLUMNS - headers
        if missing:
            await _fail(task_id, f"CSV 缺少必要字段: {', '.join(sorted(missing))}")
            return

        rows = list(reader)
        total_rows = len(rows)

        if total_rows == 0:
            await _fail(task_id, "CSV 文件没有数据行")
            return

        # --- Step 2: Processing ---
        progress_store.update(task_id, status="processing", progress=0, message=f"解析数据中... 0/{total_rows} 行")

        file_id = uuid.uuid4()
        parsed_rows = []
        robot_ids = set()
        timestamps = []

        # Per-robot stats accumulator
        robot_stats = defaultdict(lambda: {
            'count': 0, 'battery_sum': 0.0, 'battery_min': float('inf'),
            'error_count': 0,
            'a_ok': 0, 'a_warning': 0, 'a_error': 0,
            'b_ok': 0, 'b_warning': 0, 'b_error': 0,
        })

        for i, row in enumerate(rows):
            try:
                ts = datetime.fromisoformat(row["timestamp"].replace("Z", "+00:00"))
            except (ValueError, KeyError):
                await _fail(task_id, f"第 {i + 2} 行 timestamp 格式无效: {row.get('timestamp', '')}")
                return

            rid = row["robot_id"]
            battery = float(row["battery_level"])
            device_a = row["device_a_status"]
            device_b = row["device_b_status"]
            error_code = row.get("error_code") or None

            parsed_rows.append({
                "file_id": file_id,
                "robot_id": rid,
                "timestamp": ts,
                "location_x": float(row["location_x"]),
                "location_y": float(row["location_y"]),
                "battery_level": battery,
                "device_a_status": device_a,
                "device_b_status": device_b,
                "speed": float(row["speed"]),
                "error_code": error_code,
            })
            robot_ids.add(rid)
            timestamps.append(ts)

            # Accumulate stats
            s = robot_stats[rid]
            s['count'] += 1
            s['battery_sum'] += battery
            s['battery_min'] = min(s['battery_min'], battery)
            if error_code:
                s['error_count'] += 1
            s[f'a_{device_a}'] += 1
            s[f'b_{device_b}'] += 1

            # Update progress every batch
            if (i + 1) % BATCH_SIZE == 0 or i == total_rows - 1:
                pct = int((i + 1) / total_rows * 90)  # Reserve 10% for DB write
                progress_store.update(
                    task_id, progress=pct,
                    message=f"解析数据中... {i + 1}/{total_rows} 行",
                )

        # --- Step 3: Write to DB ---
        progress_store.update(task_id, progress=90, message="写入数据库...")

        async with async_session() as session:
            # Create csv_file record
            csv_file = CsvFile(
                id=file_id,
                original_filename=filename,
                stored_path=file_path,
                file_size=file_size,
                row_count=total_rows,
                robot_count=len(robot_ids),
                time_range_start=min(timestamps) if timestamps else None,
                time_range_end=max(timestamps) if timestamps else None,
            )
            session.add(csv_file)

            # Batch insert robot_data
            for start in range(0, len(parsed_rows), BATCH_SIZE):
                batch = parsed_rows[start:start + BATCH_SIZE]
                await session.execute(insert(RobotData), batch)

            # Insert robot_summaries
            summary_rows = []
            for rid, s in robot_stats.items():
                n = s['count']
                summary_rows.append({
                    "file_id": file_id,
                    "robot_id": rid,
                    "data_points": n,
                    "avg_battery": round(s['battery_sum'] / n, 2) if n else 0,
                    "min_battery": s['battery_min'] if n else 0,
                    "error_count": s['error_count'],
                    "device_a_ok_ratio": round(s['a_ok'] / n, 4) if n else 0,
                    "device_a_warning_ratio": round(s['a_warning'] / n, 4) if n else 0,
                    "device_a_error_ratio": round(s['a_error'] / n, 4) if n else 0,
                    "device_b_ok_ratio": round(s['b_ok'] / n, 4) if n else 0,
                    "device_b_warning_ratio": round(s['b_warning'] / n, 4) if n else 0,
                    "device_b_error_ratio": round(s['b_error'] / n, 4) if n else 0,
                })
            if summary_rows:
                await session.execute(insert(RobotSummary), summary_rows)

            # Update upload_task
            task = await session.get(UploadTask, uuid.UUID(task_id))
            if task:
                task.status = "completed"
                task.progress = 100
                task.file_id = file_id
                task.completed_at = datetime.now(timezone.utc)

            await session.commit()

        # --- Step 4: Compute features ---
        progress_store.update(task_id, progress=95, message="计算特征数据...")

        async with async_session() as session:
            await compute_sync_features(file_id, session)
            await session.commit()

        # Launch async features in background
        asyncio.create_task(launch_async_features(file_id))

        # --- Done ---
        progress_store.update(
            task_id, status="completed", progress=100,
            message="处理完成", file_id=str(file_id), done=True,
        )

    except Exception as e:
        await _fail(task_id, f"处理失败: {str(e)}")


async def _fail(task_id: str, message: str):
    """Mark task as failed in both progress store and DB."""
    progress_store.update(task_id, status="error", progress=0, message=message, done=True)

    async with async_session() as session:
        task = await session.get(UploadTask, uuid.UUID(task_id))
        if task:
            task.status = "error"
            task.error_message = message
            task.completed_at = datetime.now(timezone.utc)
            await session.commit()
