from datetime import datetime
from typing import Dict, List, Optional
from pydantic import BaseModel, Field
from app.schemas.storage import FolderItem, ObjectMetadata


class ObjectListResponse(BaseModel):
    prefix: str
    folders: List[FolderItem]
    objects: List[ObjectMetadata]
    total_count: int
    total_size: int


class PresignUploadRequest(BaseModel):
    key: str = Field(description="Target object key path, e.g. documents/report.pdf")
    content_type: str = Field(
        default="application/octet-stream",
        description="MIME content type of the file",
    )
    size: Optional[int] = Field(default=None, description="Optional size in bytes")


class PresignUploadResponse(BaseModel):
    upload_url: str
    method: str = "PUT"
    headers: Dict[str, str]
    key: str
    expires_in: int


class PresignDownloadResponse(BaseModel):
    download_url: str
    key: str
    expires_in: int


class DeleteObjectResponse(BaseModel):
    success: bool
    key: str
    message: str
