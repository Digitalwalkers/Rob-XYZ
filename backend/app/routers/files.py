from datetime import datetime
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import CsvFile, RobotData, RobotSummary, UploadTask
from app.schemas import (
    CsvFileResponse, RobotListResponse, TimeRangeResponse, RobotDataRow,
)

router = APIRouter()


@router.get("/files", response_model=list[CsvFileResponse])
async def list_files(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(CsvFile).order_by(CsvFile.created_at.desc())
    )
    return result.scalars().all()


@router.get("/files/{file_id}", response_model=CsvFileResponse)
async def get_file(file_id: UUID, db: AsyncSession = Depends(get_db)):
    csv_file = await db.get(CsvFile, file_id)
    if not csv_file:
        raise HTTPException(status_code=404, detail="文件不存在")
    return csv_file


@router.get("/files/{file_id}/robots", response_model=RobotListResponse)
async def get_file_robots(file_id: UUID, db: AsyncSession = Depends(get_db)):
    csv_file = await db.get(CsvFile, file_id)
    if not csv_file:
        raise HTTPException(status_code=404, detail="文件不存在")
    result = await db.execute(
        select(RobotSummary)
        .where(RobotSummary.file_id == file_id)
        .order_by(RobotSummary.robot_id)
    )
    return RobotListResponse(robots=list(result.scalars().all()))


@router.get("/files/{file_id}/time-range", response_model=TimeRangeResponse)
async def get_file_time_range(
    file_id: UUID,
    robot_ids: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    csv_file = await db.get(CsvFile, file_id)
    if not csv_file:
        raise HTTPException(status_code=404, detail="文件不存在")

    query = select(
        func.min(RobotData.timestamp),
        func.max(RobotData.timestamp),
    ).where(RobotData.file_id == file_id)

    if robot_ids:
        ids = [r.strip() for r in robot_ids.split(",") if r.strip()]
        query = query.where(RobotData.robot_id.in_(ids))

    result = await db.execute(query)
    row = result.one()
    return TimeRangeResponse(start=row[0], end=row[1])


@router.get("/files/{file_id}/data", response_model=list[RobotDataRow])
async def get_file_data(
    file_id: UUID,
    robot_ids: str | None = Query(None),
    start: datetime | None = Query(None),
    end: datetime | None = Query(None),
    sample_interval: int | None = Query(None, ge=1),
    db: AsyncSession = Depends(get_db),
):
    csv_file = await db.get(CsvFile, file_id)
    if not csv_file:
        raise HTTPException(status_code=404, detail="文件不存在")

    query = select(RobotData).where(RobotData.file_id == file_id)

    if robot_ids:
        ids = [r.strip() for r in robot_ids.split(",") if r.strip()]
        query = query.where(RobotData.robot_id.in_(ids))
    if start:
        query = query.where(RobotData.timestamp >= start)
    if end:
        query = query.where(RobotData.timestamp <= end)

    if sample_interval and sample_interval > 1:
        query = query.where(
            text("(EXTRACT(EPOCH FROM timestamp)::bigint) % :si = 0").bindparams(si=sample_interval)
        )

    query = query.order_by(RobotData.timestamp)
    result = await db.execute(query)
    return result.scalars().all()


@router.delete("/files/{file_id}", status_code=204)
async def delete_file(file_id: UUID, db: AsyncSession = Depends(get_db)):
    csv_file = await db.get(CsvFile, file_id)
    if not csv_file:
        raise HTTPException(status_code=404, detail="文件不存在")

    # Delete the stored file from disk
    stored = Path(csv_file.stored_path)
    if stored.exists():
        stored.unlink()

    # Update related upload_tasks to clear file_id reference
    result = await db.execute(
        select(UploadTask).where(UploadTask.file_id == file_id)
    )
    for task in result.scalars():
        task.file_id = None

    # Delete csv_file (cascades to robot_data)
    await db.delete(csv_file)
    await db.commit()
