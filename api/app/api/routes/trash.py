from fastapi import APIRouter, Depends, Path, Query

from app.core.limits import MAX_TRASH_ITEMS_PER_REQUEST
from app.schemas.trash import (
    TrashListResponse,
    TrashMoveResponse,
    TrashPurgeResponse,
    TrashRequest,
    TrashRestoreResponse,
    TrashSelection,
)
from app.services.storage.base import BaseStorageService
from app.services.storage.factory import get_storage_service
from app.services.storage.keys import normalize_folder, normalize_key

router = APIRouter(prefix="/trash", tags=["Trash"])

BATCH_ID_PATTERN = r"^\d{8}T\d{6}Z-[0-9a-f]{6}$"


def _unique_roots(items) -> list[tuple[str, str]]:
    """Normalized (type, path) pairs, with repeats and anything inside a listed folder dropped."""
    pairs = {
        (
            item.type,
            normalize_folder(item.path) if item.type == "folder" else normalize_key(item.path),
        )
        for item in items
    }
    folders = [path for kind, path in pairs if kind == "folder"]
    return sorted(
        (kind, path)
        for kind, path in pairs
        if not any(path != folder and path.startswith(folder) for folder in folders)
    )


@router.post("", response_model=TrashMoveResponse)
def move_to_trash(
    payload: TrashRequest,
    storage: BaseStorageService = Depends(get_storage_service),
):
    """Move files and folders to the trash, where they can be restored."""
    batch, failed = storage.move_to_trash(_unique_roots(payload.items))
    return TrashMoveResponse(batch=batch, failed=failed)


@router.get("", response_model=TrashListResponse)
def list_trash(storage: BaseStorageService = Depends(get_storage_service)):
    """What is in the trash, newest first."""
    batches = storage.list_trash()
    return TrashListResponse(batches=batches, total_size=sum(b.total_size for b in batches))


@router.post("/{batch_id}/restore", response_model=TrashRestoreResponse)
def restore_from_trash(
    batch_id: str = Path(pattern=BATCH_ID_PATTERN),
    selection: TrashSelection | None = None,
    storage: BaseStorageService = Depends(get_storage_service),
):
    """Put a deleted batch back where it was, or only the items named in the body.

    Never overwrites anything.
    """
    restored, failed = storage.restore_from_trash(batch_id, selection.paths if selection else None)
    return TrashRestoreResponse(restored=restored, failed=failed)


@router.delete("/{batch_id}", response_model=TrashPurgeResponse)
def delete_from_trash(
    batch_id: str = Path(pattern=BATCH_ID_PATTERN),
    paths: list[str] | None = Query(
        default=None,
        max_length=MAX_TRASH_ITEMS_PER_REQUEST,
        description="Delete only these items of the batch (their original paths)",
    ),
    storage: BaseStorageService = Depends(get_storage_service),
):
    """Delete one batch from the trash for good, or only some of its items."""
    return TrashPurgeResponse(deleted_count=storage.purge_trash(batch_id, paths))


@router.delete("", response_model=TrashPurgeResponse)
def empty_trash(storage: BaseStorageService = Depends(get_storage_service)):
    """Delete everything in the trash for good."""
    return TrashPurgeResponse(deleted_count=storage.purge_trash())
