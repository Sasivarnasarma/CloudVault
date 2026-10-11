from fastapi import APIRouter, Depends, Query, Request

from app.api.streaming import progress_stream, wants_progress
from app.core.limits import MAX_ARCHIVE_FILES
from app.schemas.folder import (
    CreateFolderRequest,
    CreateFolderResponse,
    DeleteFolderResponse,
    FolderTreeResponse,
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
    request: Request,
    payload: TransferFolderRequest,
    storage: BaseStorageService = Depends(get_storage_service),
):
    """Recursively copy a folder to a new path. Never overwrites existing content.

    Send `Accept: application/x-ndjson` to follow the progress as it happens.
    """
    source, destination = normalize_folder(payload.source), normalize_folder(payload.destination)

    def run(progress=None) -> TransferFolderResponse:
        count = storage.copy_folder(source, destination, progress)
        return TransferFolderResponse(
            success=True, source=source, destination=destination, item_count=count
        )

    if wants_progress(request):
        return progress_stream(lambda progress: run(progress).model_dump())
    return run()


@router.post("/move", response_model=TransferFolderResponse)
def move_folder(
    request: Request,
    payload: TransferFolderRequest,
    storage: BaseStorageService = Depends(get_storage_service),
):
    """Move or rename a folder. Never overwrites existing content.

    Send `Accept: application/x-ndjson` to follow the progress as it happens.
    """
    source, destination = normalize_folder(payload.source), normalize_folder(payload.destination)

    def run(progress=None) -> TransferFolderResponse:
        count = storage.move_folder(source, destination, progress)
        return TransferFolderResponse(
            success=True, source=source, destination=destination, item_count=count
        )

    if wants_progress(request):
        return progress_stream(lambda progress: run(progress).model_dump())
    return run()


@router.get("/tree", response_model=FolderTreeResponse)
def get_folder_tree(
    prefix: str = Query(..., description="Folder to list, with everything inside it"),
    storage: BaseStorageService = Depends(get_storage_service),
):
    """Every file under a folder with its size, so the browser can zip the folder itself."""
    clean_prefix = normalize_folder(prefix)
    files, empty_folders = storage.list_folder_tree(clean_prefix, MAX_ARCHIVE_FILES)
    return FolderTreeResponse(
        prefix=clean_prefix,
        files=files,
        empty_folders=empty_folders,
        total_size=sum(f.size for f in files),
    )
