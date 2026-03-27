import uuid
from datetime import datetime

from pydantic import BaseModel


# --- Upload Task ---
class UploadTaskResponse(BaseModel):
    id: uuid.UUID
    original_filename: str
    file_size: int
    status: str
    progress: int
    error_message: str | None = None
    file_id: uuid.UUID | None = None
    created_at: datetime
    completed_at: datetime | None = None

    model_config = {"from_attributes": True}


class UploadResponse(BaseModel):
    task_id: uuid.UUID


# --- CSV File ---
class CsvFileResponse(BaseModel):
    id: uuid.UUID
    original_filename: str
    file_size: int
    row_count: int
    robot_count: int
    time_range_start: datetime | None = None
    time_range_end: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Exploration ---
class RobotSummaryResponse(BaseModel):
    robot_id: str
    data_points: int
    avg_battery: float
    min_battery: float
    error_count: int
    device_a_ok_ratio: float
    device_a_warning_ratio: float
    device_a_error_ratio: float
    device_b_ok_ratio: float
    device_b_warning_ratio: float
    device_b_error_ratio: float

    model_config = {"from_attributes": True}


class RobotListResponse(BaseModel):
    robots: list[RobotSummaryResponse]


class TimeRangeResponse(BaseModel):
    start: datetime | None = None
    end: datetime | None = None


class RobotDataRow(BaseModel):
    robot_id: str
    timestamp: datetime
    location_x: float
    location_y: float
    battery_level: float
    device_a_status: str
    device_b_status: str
    speed: float
    error_code: str | None = None

    model_config = {"from_attributes": True}


# --- SSE Progress ---
class ProgressEvent(BaseModel):
    status: str
    progress: int
    message: str
    file_id: uuid.UUID | None = None
