from fastapi import APIRouter, Depends, Query

from app.schemas.folder import (
    CreateFolderRequest,
    CreateFolderResponse,
    DeleteFolderResponse,
)
from app.services.storage.base import BaseStorageService
from app.services.storage.factory import get_storage_service
from app.services.storage.keys import normalize_folder

router = APIRouter(prefix="/folders", tags=["Folders"])


@router.post("", response_model=CreateFolderResponse)
def create_folder(
    payload: CreateFolderRequest,
    storage: BaseStorageService = Depends(get_storage_service),
):
    """Create a new virtual folder marker object."""
    folder = storage.create_folder(folder_path=normalize_folder(payload.path))
    return CreateFolderResponse(success=True, folder=folder)


@router.delete("", response_model=DeleteFolderResponse)
def delete_folder(
    prefix: str = Query(..., description="Target folder prefix to delete recursively"),
    storage: BaseStorageService = Depends(get_storage_service),
):
    """Recursively delete a folder prefix and all contained objects."""
    clean_prefix = normalize_folder(prefix)
    deleted_count = storage.delete_folder(prefix=clean_prefix)
    return DeleteFolderResponse(success=True, prefix=clean_prefix, deleted_count=deleted_count)
