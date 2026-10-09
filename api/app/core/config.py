from typing import List, Optional

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

SUPPORTED_PROVIDERS = ("minio", "s3", "r2")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    APP_NAME: str = "CloudVault API"
    APP_VERSION: str = "0.1.0"

    STORAGE_PROVIDER: str = Field(default="minio", description="minio, s3, or r2")
    S3_ENDPOINT: Optional[str] = Field(default=None, description="Leave empty for AWS S3")
    S3_REGION: str = Field(default="us-east-1")
    S3_BUCKET: str
    S3_ACCESS_KEY: str
    S3_SECRET_KEY: str
    S3_ADDRESSING_STYLE: str = Field(default="path", description="path or virtual")

    # Largest file accepted. Files over 5 GiB are uploaded in parts (S3's own maximum is 5 TiB).
    MAX_UPLOAD_BYTES: int = Field(default=5 * 1024**4, gt=0)

    CORS_ORIGINS: List[str] = Field(
        default_factory=lambda: ["http://localhost:5173", "http://127.0.0.1:5173"]
    )
    LOG_LEVEL: str = "INFO"

    @field_validator("STORAGE_PROVIDER")
    @classmethod
    def _check_provider(cls, value: str) -> str:
        value = value.strip().lower()
        if value not in SUPPORTED_PROVIDERS:
            raise ValueError(f"STORAGE_PROVIDER must be one of {', '.join(SUPPORTED_PROVIDERS)}")
        return value

    @field_validator("S3_ENDPOINT")
    @classmethod
    def _empty_endpoint_is_none(cls, value: Optional[str]) -> Optional[str]:
        return value or None


settings = Settings()  # type: ignore[call-arg]  # required fields come from the environment
