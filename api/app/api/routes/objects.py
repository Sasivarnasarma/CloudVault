import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from botocore.exceptions import ClientError
from app.schemas.object import (
    DeleteObjectResponse,
    ObjectListResponse,
    PresignDownloadResponse,
    PresignUploadRequest,
    PresignUploadResponse,
)
from app.schemas.storage import ObjectMetadata
from app.services.storage.base import BaseStorageService
from app.services.storage.factory import get_storage_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/objects", tags=["Objects"])


def _sanitize_key(key: str) -> str:
    """Sanitize and validate object key against path traversal and dangerous characters."""
    if not key or not key.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Object key cannot be empty",
        )
    clean_key = key.strip().lstrip("/")
    if ".." in clean_key.split("/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Path traversal semantics ('..') are not allowed in object keys",
        )
    return clean_key


@router.get("", response_model=ObjectListResponse)
async def list_objects(
    prefix: str = Query(default="", description="Folder key prefix filter"),
    delimiter: str = Query(default="/", description="Hierarchy delimiter"),
    storage: BaseStorageService = Depends(get_storage_service),
):
    """List objects and subfolders at a specific prefix."""
    try:
        clean_prefix = prefix.strip().lstrip("/")
        if ".." in clean_prefix.split("/"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Path traversal semantics ('..') are not allowed",
            )
        folders, objects = storage.list_objects(prefix=clean_prefix, delimiter=delimiter)
        total_count = len(folders) + len(objects)
        total_size = sum(obj.size for obj in objects)

        return ObjectListResponse(
            prefix=clean_prefix,
            folders=folders,
            objects=objects,
            total_count=total_count,
            total_size=total_size,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing objects for prefix '{prefix}': {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to list storage objects",
        )


@router.get("/metadata", response_model=ObjectMetadata)
async def get_object_metadata(
    key: str = Query(..., description="Target object key"),
    storage: BaseStorageService = Depends(get_storage_service),
):
    """Get detailed metadata for a specific object key."""
    clean_key = _sanitize_key(key)
    try:
        return storage.get_object_metadata(key=clean_key)
    except ClientError as e:
        error_code = e.response.get("Error", {}).get("Code", "")
        if error_code in ("404", "NoSuchKey", "NotFound"):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Object '{clean_key}' not found",
            )
        logger.error(f"Error retrieving metadata for '{clean_key}': {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve object metadata",
        )


@router.post("/presign-upload", response_model=PresignUploadResponse)
async def generate_presigned_upload_url(
    payload: PresignUploadRequest,
    storage: BaseStorageService = Depends(get_storage_service),
):
    """Generate a presigned PUT URL for direct browser upload to storage."""
    clean_key = _sanitize_key(payload.key)
    content_type = payload.content_type or "application/octet-stream"

    try:
        presign_data = storage.generate_upload_url(
            key=clean_key,
            content_type=content_type,
            expires_in=900,  # 15 minutes
        )
        return PresignUploadResponse(
            upload_url=presign_data.upload_url,
            method=presign_data.method,
            headers=presign_data.headers,
            key=presign_data.key,
            expires_in=presign_data.expires_in,
        )
    except Exception as e:
        logger.error(f"Error generating presigned upload URL for '{clean_key}': {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate presigned upload URL",
        )


@router.get("/presign-download", response_model=PresignDownloadResponse)
async def generate_presigned_download_url(
    key: str = Query(..., description="Target object key"),
    filename: Optional[str] = Query(default=None, description="Custom download filename"),
    storage: BaseStorageService = Depends(get_storage_service),
):
    """Generate a presigned GET URL for direct browser download from storage."""
    clean_key = _sanitize_key(key)

    # Verify object existence
    try:
        storage.get_object_metadata(key=clean_key)
    except ClientError as e:
        error_code = e.response.get("Error", {}).get("Code", "")
        if error_code in ("404", "NoSuchKey", "NotFound"):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Object '{clean_key}' not found",
            )

    try:
        presign_data = storage.generate_download_url(
            key=clean_key,
            expires_in=3600,  # 60 minutes
            filename=filename,
        )
        return PresignDownloadResponse(
            download_url=presign_data.download_url,
            key=presign_data.key,
            expires_in=presign_data.expires_in,
        )
    except Exception as e:
        logger.error(f"Error generating presigned download URL for '{clean_key}': {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate presigned download URL",
        )


@router.delete("", response_model=DeleteObjectResponse)
async def delete_object(
    key: str = Query(..., description="Target object key to delete"),
    storage: BaseStorageService = Depends(get_storage_service),
):
    """Delete a single object key from storage."""
    clean_key = _sanitize_key(key)
    try:
        storage.delete_object(key=clean_key)
        return DeleteObjectResponse(
            success=True,
            key=clean_key,
            message=f"Object '{clean_key}' deleted successfully",
        )
    except Exception as e:
        logger.error(f"Error deleting object '{clean_key}': {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete object '{clean_key}'",
        )
