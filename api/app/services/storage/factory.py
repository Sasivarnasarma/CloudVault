from functools import lru_cache
from app.services.storage.base import BaseStorageService
from app.services.storage.s3 import S3StorageService


@lru_cache()
def get_storage_service() -> BaseStorageService:
    """FastAPI dependency provider for storage service singleton."""
    return S3StorageService()
