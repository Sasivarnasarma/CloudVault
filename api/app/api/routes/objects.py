from typing import Optional

from fastapi import APIRouter, Depends, Query

from app.core.config import settings
from app.schemas.object import (
    DeleteObjectResponse,
    ObjectListResponse,
    PresignDownloadResponse,
    PresignUploadRequest,
    PresignUploadResponse,
)
from app.schemas.storage import ObjectMetadata
from app.services.storage.base import BaseStorageService
from app.services.storage.exceptions import PayloadTooLargeError
from app.services.storage.factory import get_storage_service
from app.services.storage.keys import normalize_key, normalize_prefix

router = APIRouter(prefix="/objects", tags=["Objects"])

UPLOAD_URL_TTL_SECONDS = 900
DOWNLOAD_URL_TTL_SECONDS = 3600


@router.get("", response_model=ObjectListResponse)
def list_objects(
    prefix: str = Query(default="", description="Folder key prefix filter"),
    storage: BaseStorageService = Depends(get_storage_service),
):
    """List objects and subfolders at a specific prefix."""
    clean_prefix = normalize_prefix(prefix)
    folders, objects = storage.list_objects(prefix=clean_prefix)
    return ObjectListResponse(
        prefix=clean_prefix,
        folders=folders,
        objects=objects,
        total_count=len(folders) + len(objects),
        total_size=sum(obj.size for obj in objects),
    )


@router.get("/metadata", response_model=ObjectMetadata)
def get_object_metadata(
    key: str = Query(..., description="Target object key"),
    storage: BaseStorageService = Depends(get_storage_service),
):
    """Get detailed metadata for a specific object key."""
    return storage.get_object_metadata(key=normalize_key(key))


@router.post("/presign-upload", response_model=PresignUploadResponse)
def generate_presigned_upload_url(
    payload: PresignUploadRequest,
    storage: BaseStorageService = Depends(get_storage_service),
):
    """Generate a presigned PUT URL for direct browser upload to storage."""
    clean_key = normalize_key(payload.key)
    if payload.size is not None and payload.size > settings.MAX_UPLOAD_BYTES:
        raise PayloadTooLargeError(
            f"File exceeds the {settings.MAX_UPLOAD_BYTES // 1024**2} MiB upload limit"
        )
    return storage.generate_upload_url(
        key=clean_key,
        content_type=payload.content_type,
        expires_in=UPLOAD_URL_TTL_SECONDS,
    )


@router.get("/presign-download", response_model=PresignDownloadResponse)
def generate_presigned_download_url(
    key: str = Query(..., description="Target object key"),
    filename: Optional[str] = Query(default=None, max_length=255, description="Custom download filename"),
    storage: BaseStorageService = Depends(get_storage_service),
):
    """Generate a presigned GET URL for direct browser download from storage."""
    clean_key = normalize_key(key)
    storage.get_object_metadata(key=clean_key)  # raises ObjectNotFoundError if missing
    return storage.generate_download_url(
        key=clean_key, expires_in=DOWNLOAD_URL_TTL_SECONDS, filename=filename
    )


@router.delete("", response_model=DeleteObjectResponse)
def delete_object(
    key: str = Query(..., description="Target object key to delete"),
    storage: BaseStorageService = Depends(get_storage_service),
):
    """Delete a single object key from storage."""
    clean_key = normalize_key(key)
    storage.delete_object(key=clean_key)
    return DeleteObjectResponse(
        success=True, key=clean_key, message=f"Object '{clean_key}' deleted successfully"
    )
