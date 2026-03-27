import asyncio
import json
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import CsvFile, FeatureTask, RobotFeature
from app.schemas import FeatureRegistryItem, FeatureStatusResponse, RobotFeatureItem
from app.features.registry import FEATURES
from app.features.service import compute_sync_features, launch_async_features
from app.services.progress import progress_store

router = APIRouter()


@router.get("/features/registry", response_model=list[FeatureRegistryItem])
async def get_feature_registry():
    return [
        FeatureRegistryItem(key=k, **{f: v[f] for f in ("label", "shape", "timing", "color", "severity")})
        for k, v in FEATURES.items()
    ]


@router.get("/files/{file_id}/features/status", response_model=list[FeatureStatusResponse])
async def get_feature_status(file_id: UUID, db: AsyncSession = Depends(get_db)):
    csv_file = await db.get(CsvFile, file_id)
    if not csv_file:
        raise HTTPException(status_code=404, detail="文件不存在")

    result = await db.execute(
        select(FeatureTask).where(FeatureTask.file_id == file_id)
    )
    tasks = result.scalars().all()

    # Build status for all features, defaulting to "pending" if no task record
    task_map = {t.feature_key: t for t in tasks}
    statuses = []
    for key in FEATURES:
        t = task_map.get(key)
        if t:
            statuses.append(FeatureStatusResponse(
                feature_key=key, status=t.status, progress=t.progress,
            ))
        else:
            statuses.append(FeatureStatusResponse(
                feature_key=key, status="pending", progress=0,
            ))
    return statuses


@router.post("/files/{file_id}/features/compute")
async def compute_features(file_id: UUID, db: AsyncSession = Depends(get_db)):
    """Trigger feature computation for an existing file (for files uploaded before the feature system)."""
    csv_file = await db.get(CsvFile, file_id)
    if not csv_file:
        raise HTTPException(status_code=404, detail="文件不存在")

    # Check if already computed
    result = await db.execute(
        select(FeatureTask).where(FeatureTask.file_id == file_id)
    )
    existing = result.scalars().all()
    if existing:
        return {"message": "特征已计算或正在计算中"}

    # Run sync features
    await compute_sync_features(file_id, db)
    await db.commit()

    # Launch async features in background
    asyncio.create_task(launch_async_features(file_id))

    return {"message": "特征计算已启动"}


@router.get("/files/{file_id}/features/data", response_model=list[RobotFeatureItem])
async def get_feature_data(
    file_id: UUID,
    feature_keys: str | None = Query(None),
    robot_ids: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    csv_file = await db.get(CsvFile, file_id)
    if not csv_file:
        raise HTTPException(status_code=404, detail="文件不存在")

    query = select(RobotFeature).where(RobotFeature.file_id == file_id)

    if feature_keys:
        keys = [k.strip() for k in feature_keys.split(",") if k.strip()]
        query = query.where(RobotFeature.feature_key.in_(keys))
    if robot_ids:
        ids = [r.strip() for r in robot_ids.split(",") if r.strip()]
        query = query.where(RobotFeature.robot_id.in_(ids))

    query = query.order_by(RobotFeature.start_time)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/files/{file_id}/features/progress")
async def feature_progress(file_id: UUID):
    progress_key = f"features:{file_id}"

    async def event_stream():
        while True:
            tp = progress_store.get(progress_key)
            if tp is None:
                yield f"data: {json.dumps({'status': 'completed', 'progress': 100, 'message': '无进行中的计算'})}\n\n"
                break

            event_data = {
                "status": tp.status,
                "progress": tp.progress,
                "message": tp.message,
            }
            yield f"data: {json.dumps(event_data, ensure_ascii=False)}\n\n"

            if tp.done:
                progress_store.cleanup(progress_key)
                break

            await progress_store.wait_for_update(progress_key)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
