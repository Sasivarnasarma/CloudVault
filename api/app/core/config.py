import os
from typing import List, Union
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    APP_NAME: str = "CloudVault API"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = False

    STORAGE_PROVIDER: str = Field(default="minio", description="minio, s3, or r2")
    S3_ENDPOINT: str = Field(default="http://localhost:9000")
    S3_REGION: str = Field(default="us-east-1")
    S3_BUCKET: str = Field(default="cloudvault")
    S3_ACCESS_KEY: str = Field(default="minioadmin")
    S3_SECRET_KEY: str = Field(default="minioadmin")
    S3_ADDRESSING_STYLE: str = Field(default="path", description="path or virtual")

    CORS_ORIGINS: List[str] = Field(
        default_factory=lambda: ["http://localhost:5173", "http://127.0.0.1:5173"]
    )
    LOG_LEVEL: str = "INFO"


settings = Settings()
