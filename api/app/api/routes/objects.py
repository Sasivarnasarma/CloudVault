from fastapi import APIRouter, Depends, Query

from app.api.checks import check_upload_size
from app.schemas.object import (
    DeleteObjectResponse,
    ObjectListResponse,
    PresignDownloadResponse,
    PresignUploadRequest,
    PresignUploadResponse,
    TransferObjectRequest,
    TransferObjectResponse,
)
from app.schemas.storage import ObjectMetadata
from app.services.storage.base import BaseStorageService
from app.services.storage.factory import get_storage_service
from app.services.storage.keys import normalize_key, normalize_prefix

router = APIRouter(prefix="/objects", tags=["Objects"])

DEFAULT_PAGE_SIZE = 500
UPLOAD_URL_TTL_SECONDS = 900
DOWNLOAD_URL_TTL_SECONDS = 3600


@router.get("", response_model=ObjectListResponse)
def list_objects(
    prefix: str = Query(default="", description="Folder key prefix filter"),
    limit: int | None = Query(
        default=None,
        ge=1,
        le=1000,
        description="Page size. Omit to return everything in one response.",
    ),
    cursor: str | None = Query(
        default=None, max_length=2048, description="`next_cursor` from the previous page"
    ),
    storage: BaseStorageService = Depends(get_storage_service),
):
    """List objects and subfolders at a specific prefix, optionally one page at a time."""
    clean_prefix = normalize_prefix(prefix)
    next_cursor: str | None = None
    if limit is None and cursor is None:
        folders, objects = storage.list_objects(prefix=clean_prefix)
    else:
        folders, objects, next_cursor = storage.list_page(
            prefix=clean_prefix, limit=limit or DEFAULT_PAGE_SIZE, cursor=cursor
        )
    return ObjectListResponse(
        prefix=clean_prefix,
        folders=folders,
        objects=objects,
        total_count=len(folders) + len(objects),
        total_size=sum(obj.size for obj in objects),
        next_cursor=next_cursor,
        has_more=next_cursor is not None,
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
    check_upload_size(payload.size, single_request=True)
    return storage.generate_upload_url(
        key=clean_key,
        content_type=payload.content_type,
        expires_in=UPLOAD_URL_TTL_SECONDS,
        allow_overwrite=payload.overwrite,
    )


@router.get("/presign-download", response_model=PresignDownloadResponse)
def generate_presigned_download_url(
    key: str = Query(..., description="Target object key"),
    filename: str | None = Query(
        default=None, max_length=255, description="Custom download filename"
    ),
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


@router.post("/copy", response_model=TransferObjectResponse)
def copy_object(
    payload: TransferObjectRequest,
    storage: BaseStorageService = Depends(get_storage_service),
):
    """Copy an object to a new key."""
    source, destination = normalize_key(payload.source), normalize_key(payload.destination)
    storage.copy_object(source, destination, allow_overwrite=payload.overwrite)
    return TransferObjectResponse(success=True, source=source, destination=destination)


@router.post("/move", response_model=TransferObjectResponse)
def move_object(
    payload: TransferObjectRequest,
    storage: BaseStorageService = Depends(get_storage_service),
):
    """Move or rename an object (copy to the new key, then delete the original)."""
    source, destination = normalize_key(payload.source), normalize_key(payload.destination)
    storage.move_object(source, destination, allow_overwrite=payload.overwrite)
    return TransferObjectResponse(success=True, source=source, destination=destination)
