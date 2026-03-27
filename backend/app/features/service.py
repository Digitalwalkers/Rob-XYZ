"""Feature computation orchestration.

- compute_sync_features: called during upload pipeline, runs cheap features.
- launch_async_features: spawned as asyncio.create_task, runs expensive features with SSE progress.
"""

import asyncio
from collections import defaultdict
from datetime import datetime, timezone

from sqlalchemy import insert, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session
from app.models import RobotData, RobotFeature, FeatureTask
from app.features.registry import SYNC_FEATURES, ASYNC_FEATURES
from app.features.compute import SYNC_COMPUTE_MAP, ASYNC_COMPUTE_MAP
from app.services.progress import progress_store


async def _load_rows_by_robot(file_id, session: AsyncSession):
    """Load all RobotData for a file, grouped by robot_id, ordered by timestamp."""
    result = await session.execute(
        select(RobotData)
        .where(RobotData.file_id == file_id)
        .order_by(RobotData.robot_id, RobotData.timestamp)
    )
    rows = result.scalars().all()

    grouped = defaultdict(list)
    for row in rows:
        grouped[row.robot_id].append(row)
    return grouped


async def compute_sync_features(file_id, session: AsyncSession):
    """Compute all sync features and insert results. Called within upload transaction."""
    grouped = await _load_rows_by_robot(file_id, session)

    all_features = []
    for feature_key in SYNC_FEATURES:
        compute_fn = SYNC_COMPUTE_MAP[feature_key]
        for robot_id, rows in grouped.items():
            all_features.extend(compute_fn(rows, robot_id, file_id))

        # Record task as completed
        session.add(FeatureTask(
            file_id=file_id,
            feature_key=feature_key,
            status="completed",
            progress=100,
            completed_at=datetime.now(timezone.utc),
        ))

    # Bulk insert feature data
    if all_features:
        await session.execute(insert(RobotFeature), all_features)


async def launch_async_features(file_id):
    """Compute async features in background. Uses progress_store for SSE."""
    progress_key = f"features:{file_id}"
    progress_store.create(progress_key)

    try:
        async with async_session() as session:
            grouped = await _load_rows_by_robot(file_id, session)

            total_async = len(ASYNC_FEATURES)
            for idx, feature_key in enumerate(ASYNC_FEATURES):
                # Create/update task record
                task = FeatureTask(
                    file_id=file_id,
                    feature_key=feature_key,
                    status="computing",
                    progress=0,
                )
                session.add(task)
                await session.flush()

                progress_store.update(
                    progress_key,
                    status="computing",
                    progress=int((idx / total_async) * 100),
                    message=f"计算 {feature_key}...",
                )

                # Compute
                compute_fn = ASYNC_COMPUTE_MAP[feature_key]
                all_features = []
                robot_ids = list(grouped.keys())
                for ri, (robot_id, rows) in enumerate(grouped.items()):
                    all_features.extend(compute_fn(rows, robot_id, file_id))
                    # Yield control periodically
                    if ri % 10 == 0:
                        await asyncio.sleep(0)

                if all_features:
                    await session.execute(insert(RobotFeature), all_features)

                # Mark completed
                task.status = "completed"
                task.progress = 100
                task.completed_at = datetime.now(timezone.utc)

                progress_store.update(
                    progress_key,
                    status="computing",
                    progress=int(((idx + 1) / total_async) * 100),
                    message=f"{feature_key} 完成",
                )

            await session.commit()

        # All done
        progress_store.update(
            progress_key,
            status="completed",
            progress=100,
            message="所有特征计算完成",
            done=True,
        )

    except Exception as e:
        progress_store.update(
            progress_key,
            status="error",
            progress=0,
            message=f"特征计算失败: {str(e)}",
            done=True,
        )
