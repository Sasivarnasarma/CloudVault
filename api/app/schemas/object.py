from typing import List, Optional

from pydantic import BaseModel, Field

from app.schemas.storage import (
    FolderItem,
    ObjectMetadata,
    PresignedDownloadData,
    PresignedUploadData,
)

CONTENT_TYPE_PATTERN = r"^[A-Za-z0-9!#$&^_.+-]+/[A-Za-z0-9!#$&^_.+-]+(\s*;[^\r\n]*)?$"


class ObjectListResponse(BaseModel):
    prefix: str
    folders: List[FolderItem]
    objects: List[ObjectMetadata]
    total_count: int
    total_size: int
    next_cursor: Optional[str] = Field(default=None, description="Pass as `cursor` to fetch the next page")
    has_more: bool = False


class PresignUploadRequest(BaseModel):
    key: str = Field(description="Target object key path, e.g. documents/report.pdf")
    content_type: str = Field(
        default="application/octet-stream",
        pattern=CONTENT_TYPE_PATTERN,
        max_length=255,
        description="MIME content type of the file",
    )
    size: Optional[int] = Field(default=None, ge=0, description="File size in bytes")
    overwrite: bool = Field(default=False, description="Replace the object if the key already exists")


# Responses share the storage-layer shapes.
PresignUploadResponse = PresignedUploadData
PresignDownloadResponse = PresignedDownloadData


class DeleteObjectResponse(BaseModel):
    success: bool
    key: str
    message: str


class TransferObjectRequest(BaseModel):
    source: str = Field(description="Existing object key")
    destination: str = Field(description="New object key")
    overwrite: bool = Field(default=False, description="Replace the destination if it exists")


class TransferObjectResponse(BaseModel):
    success: bool
    source: str
    destination: str
