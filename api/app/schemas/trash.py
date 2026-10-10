from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.core.limits import MAX_TRASH_ITEMS_PER_REQUEST

ItemType = Literal["file", "folder"]


class TrashItem(BaseModel):
    path: str = Field(description="Object key of a file, or prefix of a folder")
    type: ItemType


class TrashRequest(BaseModel):
    items: list[TrashItem] = Field(min_length=1, max_length=MAX_TRASH_ITEMS_PER_REQUEST)


class TrashRoot(BaseModel):
    """One file or folder that was deleted, as it was before."""

    path: str
    type: ItemType
    size: int
    item_count: int = Field(description="Files inside, 1 for a file")


class TrashFailure(BaseModel):
    path: str
    error: str


class TrashBatch(BaseModel):
    """Everything deleted by one action. It is restored or removed together."""

    id: str
    deleted_at: datetime
    roots: list[TrashRoot]
    total_size: int


class TrashMoveResponse(BaseModel):
    batch: TrashBatch | None = Field(description="Null when nothing could be moved")
    failed: list[TrashFailure]


class TrashListResponse(BaseModel):
    batches: list[TrashBatch] = Field(description="Newest first")
    total_size: int


class TrashRestoreResponse(BaseModel):
    restored: list[str]
    failed: list[TrashFailure]


class TrashPurgeResponse(BaseModel):
    deleted_count: int
