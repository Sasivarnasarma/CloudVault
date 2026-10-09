from fastapi import APIRouter, Depends, Query

from app.schemas.folder import (
    CreateFolderRequest,
    CreateFolderResponse,
    DeleteFolderResponse,
    TransferFolderRequest,
    TransferFolderResponse,
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


@router.post("/copy", response_model=TransferFolderResponse)
def copy_folder(
    payload: TransferFolderRequest,
    storage: BaseStorageService = Depends(get_storage_service),
):
    """Recursively copy a folder to a new path. Never overwrites existing content."""
    source, destination = normalize_folder(payload.source), normalize_folder(payload.destination)
    count = storage.copy_folder(source, destination)
    return TransferFolderResponse(success=True, source=source, destination=destination, item_count=count)


@router.post("/move", response_model=TransferFolderResponse)
def move_folder(
    payload: TransferFolderRequest,
    storage: BaseStorageService = Depends(get_storage_service),
):
    """Move or rename a folder. Never overwrites existing content."""
    source, destination = normalize_folder(payload.source), normalize_folder(payload.destination)
    count = storage.move_folder(source, destination)
    return TransferFolderResponse(success=True, source=source, destination=destination, item_count=count)
