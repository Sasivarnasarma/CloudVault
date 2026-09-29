from fastapi import APIRouter, Depends
from app.core.config import settings
from app.schemas.health import HealthResponse
from app.services.storage.base import BaseStorageService
from app.services.storage.factory import get_storage_service

router = APIRouter(tags=["Health"])


@router.get("/health", response_model=HealthResponse)
async def health_check(
    storage: BaseStorageService = Depends(get_storage_service),
):
    storage_ok = storage.check_connection()
    return HealthResponse(
        status="ok" if storage_ok else "degraded",
        app_name=settings.APP_NAME,
        version=settings.APP_VERSION,
        storage_provider=settings.STORAGE_PROVIDER,
        bucket=settings.S3_BUCKET,
        storage_connected=storage_ok,
    )
