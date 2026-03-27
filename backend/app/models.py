import uuid
from datetime import datetime, timezone

from sqlalchemy import String, BigInteger, Integer, Float, Text, ForeignKey, Index, DateTime, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base


class UploadTask(Base):
    __tablename__ = "upload_tasks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    original_filename: Mapped[str] = mapped_column(String(500))
    file_size: Mapped[int] = mapped_column(BigInteger)
    status: Mapped[str] = mapped_column(String(20), default="uploading")  # uploading/validating/processing/completed/error
    progress: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    file_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("csv_files.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    file: Mapped["CsvFile | None"] = relationship(back_populates="upload_task")


class CsvFile(Base):
    __tablename__ = "csv_files"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    original_filename: Mapped[str] = mapped_column(String(500))
    stored_path: Mapped[str] = mapped_column(String(1000))
    file_size: Mapped[int] = mapped_column(BigInteger)
    row_count: Mapped[int] = mapped_column(Integer)
    robot_count: Mapped[int] = mapped_column(Integer)
    time_range_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    time_range_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    upload_task: Mapped["UploadTask | None"] = relationship(back_populates="file")
    data_rows: Mapped[list["RobotData"]] = relationship(back_populates="file", cascade="all, delete-orphan")


class RobotData(Base):
    __tablename__ = "robot_data"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    file_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("csv_files.id", ondelete="CASCADE"))
    robot_id: Mapped[str] = mapped_column(String(100))
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    location_x: Mapped[float] = mapped_column(Float)
    location_y: Mapped[float] = mapped_column(Float)
    battery_level: Mapped[float] = mapped_column(Float)
    device_a_status: Mapped[str] = mapped_column(String(20))
    device_b_status: Mapped[str] = mapped_column(String(20))
    speed: Mapped[float] = mapped_column(Float)
    error_code: Mapped[str | None] = mapped_column(String(100), nullable=True)

    file: Mapped["CsvFile"] = relationship(back_populates="data_rows")

    __table_args__ = (
        Index("ix_robot_data_file_id", "file_id"),
        Index("ix_robot_data_file_robot", "file_id", "robot_id"),
        Index("ix_robot_data_file_timestamp", "file_id", "timestamp"),
    )


class RobotSummary(Base):
    __tablename__ = "robot_summaries"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    file_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("csv_files.id", ondelete="CASCADE"))
    robot_id: Mapped[str] = mapped_column(String(100))
    data_points: Mapped[int] = mapped_column(Integer)
    avg_battery: Mapped[float] = mapped_column(Float)
    min_battery: Mapped[float] = mapped_column(Float)
    error_count: Mapped[int] = mapped_column(Integer)
    device_a_ok_ratio: Mapped[float] = mapped_column(Float)
    device_a_warning_ratio: Mapped[float] = mapped_column(Float)
    device_a_error_ratio: Mapped[float] = mapped_column(Float)
    device_b_ok_ratio: Mapped[float] = mapped_column(Float)
    device_b_warning_ratio: Mapped[float] = mapped_column(Float)
    device_b_error_ratio: Mapped[float] = mapped_column(Float)

    file: Mapped["CsvFile"] = relationship()

    __table_args__ = (
        Index("ix_robot_summary_file", "file_id"),
        UniqueConstraint("file_id", "robot_id"),
    )


class FeatureTask(Base):
    __tablename__ = "feature_tasks"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    file_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("csv_files.id", ondelete="CASCADE"))
    feature_key: Mapped[str] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending/computing/completed/error
    progress: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("ix_feature_task_file", "file_id"),
        UniqueConstraint("file_id", "feature_key"),
    )


class RobotFeature(Base):
    __tablename__ = "robot_features"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    file_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("csv_files.id", ondelete="CASCADE"))
    robot_id: Mapped[str] = mapped_column(String(100))
    feature_key: Mapped[str] = mapped_column(String(100))
    shape: Mapped[str] = mapped_column(String(20))  # point/segment
    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    end_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    metadata_json: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (
        Index("ix_robot_feature_lookup", "file_id", "robot_id", "feature_key"),
    )
