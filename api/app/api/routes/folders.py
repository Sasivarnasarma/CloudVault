import logging
from fastapi import APIRouter, Depends, HTTPException, Query, status
from app.schemas.folder import (
    CreateFolderRequest,
    CreateFolderResponse,
    DeleteFolderResponse,
)
from app.services.storage.base import BaseStorageService
from app.services.storage.factory import get_storage_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/folders", tags=["Folders"])


def _sanitize_folder_path(path: str) -> str:
    """Sanitize folder path and prevent path traversal."""
    if not path or not path.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Folder path cannot be empty",
        )
    clean_path = path.strip().lstrip("/")
    if ".." in clean_path.split("/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Path traversal semantics ('..') are not allowed in folder paths",
        )
    return clean_path


@router.post("", response_model=CreateFolderResponse)
async def create_folder(
    payload: CreateFolderRequest,
    storage: BaseStorageService = Depends(get_storage_service),
):
    """Create a new virtual folder marker object."""
    clean_path = _sanitize_folder_path(payload.path)
    try:
        folder_item = storage.create_folder(folder_path=clean_path)
        return CreateFolderResponse(success=True, folder=folder_item)
    except Exception as e:
        logger.error(f"Error creating folder '{clean_path}': {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create folder '{clean_path}'",
        )


@router.delete("", response_model=DeleteFolderResponse)
async def delete_folder(
    prefix: str = Query(..., description="Target folder prefix to delete recursively"),
    storage: BaseStorageService = Depends(get_storage_service),
):
    """Recursively delete a folder prefix and all contained objects."""
    clean_prefix = _sanitize_folder_path(prefix)
    try:
        deleted_count = storage.delete_folder(prefix=clean_prefix)
        return DeleteFolderResponse(
            success=True,
            prefix=clean_prefix,
            deleted_count=deleted_count,
        )
    except Exception as e:
        logger.error(f"Error deleting folder prefix '{clean_prefix}': {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete folder prefix '{clean_prefix}'",
        )
