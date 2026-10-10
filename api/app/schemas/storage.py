from datetime import datetime

from pydantic import BaseModel, Field


class ObjectMetadata(BaseModel):
    key: str
    name: str
    size: int
    content_type: str
    last_modified: datetime
    etag: str
    metadata: dict[str, str] = Field(default_factory=dict)


class FolderItem(BaseModel):
    name: str
    prefix: str


class PresignedUploadData(BaseModel):
    upload_url: str
    method: str = "PUT"
    headers: dict[str, str]
    key: str
    expires_in: int


class PresignedDownloadData(BaseModel):
    download_url: str
    key: str
    expires_in: int


class MultipartUploadInfo(BaseModel):
    upload_id: str
    part_size: int
    part_count: int


class UploadedPartInfo(BaseModel):
    part_number: int
    size: int
    etag: str
