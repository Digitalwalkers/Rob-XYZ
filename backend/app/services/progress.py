import asyncio
from dataclasses import dataclass, field


@dataclass
class TaskProgress:
    status: str = "uploading"
    progress: int = 0
    message: str = ""
    file_id: str | None = None
    done: bool = False


class ProgressStore:
    """In-memory store for tracking upload task progress, consumed by SSE."""

    def __init__(self):
        self._tasks: dict[str, TaskProgress] = {}
        self._events: dict[str, asyncio.Event] = {}

    def create(self, task_id: str):
        self._tasks[task_id] = TaskProgress()
        self._events[task_id] = asyncio.Event()

    def update(self, task_id: str, **kwargs):
        tp = self._tasks.get(task_id)
        if not tp:
            return
        for k, v in kwargs.items():
            setattr(tp, k, v)
        # Signal waiting SSE consumers
        event = self._events.get(task_id)
        if event:
            event.set()

    def get(self, task_id: str) -> TaskProgress | None:
        return self._tasks.get(task_id)

    async def wait_for_update(self, task_id: str, timeout: float = 5.0):
        event = self._events.get(task_id)
        if not event:
            return
        try:
            await asyncio.wait_for(event.wait(), timeout=timeout)
        except asyncio.TimeoutError:
            pass
        event.clear()

    def cleanup(self, task_id: str):
        self._tasks.pop(task_id, None)
        self._events.pop(task_id, None)


progress_store = ProgressStore()
