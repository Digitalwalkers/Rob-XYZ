from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5435/robot_platform"
    upload_dir: str = str(Path(__file__).resolve().parent.parent / "uploads")

    class Config:
        env_file = ".env"


settings = Settings()
