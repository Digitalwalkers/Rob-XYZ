import json
import uuid
from pathlib import Path

from fastapi import APIRouter, UploadFile, BackgroundTasks, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import UploadTask
from app.schemas import UploadResponse, UploadTaskResponse
from app.services.progress import progress_store
from app.services.upload_service import process_upload

router = APIRouter()


@router.post("/upload", response_model=UploadResponse)
async def upload_file(
    file: UploadFile,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    # Read file content
    content = await file.read()
    file_size = len(content)

    # Save to disk
    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)
    stored_name = f"{uuid.uuid4()}_{file.filename}"
    file_path = upload_dir / stored_name
    file_path.write_bytes(content)

    # Create upload task record
    task = UploadTask(
        original_filename=file.filename,
        file_size=file_size,
        status="uploading",
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)

    task_id = str(task.id)

    # Init progress tracking
    progress_store.create(task_id)

    # Launch background processing
    background_tasks.add_task(
        process_upload, task_id, str(file_path), file.filename, file_size
    )

    return UploadResponse(task_id=task.id)


@router.get("/upload/{task_id}/progress")
async def upload_progress(task_id: str):
    async def event_stream():
        while True:
            tp = progress_store.get(task_id)
            if tp is None:
                # Task not found - might already be cleaned up, check DB
                yield f"data: {json.dumps({'status': 'error', 'progress': 0, 'message': '任务不存在'})}\n\n"
                break

            event_data = {
                "status": tp.status,
                "progress": tp.progress,
                "message": tp.message,
            }
            if tp.file_id:
                event_data["file_id"] = tp.file_id

            yield f"data: {json.dumps(event_data, ensure_ascii=False)}\n\n"

            if tp.done:
                progress_store.cleanup(task_id)
                break

            await progress_store.wait_for_update(task_id)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/uploads", response_model=list[UploadTaskResponse])
async def list_uploads(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(UploadTask).order_by(UploadTask.created_at.desc())
    )
    return result.scalars().all()
