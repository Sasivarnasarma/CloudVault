from datetime import datetime
from typing import Dict

from pydantic import BaseModel, Field


class ObjectMetadata(BaseModel):
    key: str
    name: str
    size: int
    content_type: str
    last_modified: datetime
    etag: str
    metadata: Dict[str, str] = Field(default_factory=dict)


class FolderItem(BaseModel):
    name: str
    prefix: str


class PresignedUploadData(BaseModel):
    upload_url: str
    method: str = "PUT"
    headers: Dict[str, str]
    key: str
    expires_in: int


class PresignedDownloadData(BaseModel):
    download_url: str
    key: str
    expires_in: int
