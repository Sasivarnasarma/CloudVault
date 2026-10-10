from pydantic import BaseModel, Field

from app.core.limits import MAX_PART_URLS_PER_REQUEST, MAX_PARTS
from app.schemas.object import CONTENT_TYPE_PATTERN

UPLOAD_ID_MAX_LENGTH = 1024


class UploadRef(BaseModel):
    key: str = Field(description="Object key the upload was created for")
    upload_id: str = Field(min_length=1, max_length=UPLOAD_ID_MAX_LENGTH)


class MultipartCreateRequest(BaseModel):
    key: str
    size: int = Field(gt=0, description="Total file size in bytes")
    content_type: str = Field(
        default="application/octet-stream", pattern=CONTENT_TYPE_PATTERN, max_length=255
    )
    overwrite: bool = False


class MultipartCreateResponse(BaseModel):
    key: str
    upload_id: str
    part_size: int
    part_count: int


class PartUrlsRequest(UploadRef):
    part_numbers: list[int] = Field(min_length=1, max_length=MAX_PART_URLS_PER_REQUEST)


class PartUrl(BaseModel):
    part_number: int
    url: str


class PartUrlsResponse(BaseModel):
    parts: list[PartUrl]
    expires_in: int


class UploadedPart(BaseModel):
    part_number: int
    size: int
    etag: str


class UploadedPartsResponse(BaseModel):
    parts: list[UploadedPart]


class MultipartCompleteRequest(UploadRef):
    part_count: int = Field(ge=1, le=MAX_PARTS, description="Number of parts the client uploaded")


class MultipartCompleteResponse(BaseModel):
    success: bool
    key: str
    etag: str | None = None


class MultipartAbortResponse(BaseModel):
    success: bool
