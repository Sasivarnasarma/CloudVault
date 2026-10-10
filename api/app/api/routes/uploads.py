from fastapi import APIRouter, Depends, Query

from app.api.checks import check_upload_size
from app.core.limits import MAX_PART_URLS_PER_REQUEST
from app.schemas.upload import (
    UPLOAD_ID_MAX_LENGTH,
    MultipartAbortResponse,
    MultipartCompleteRequest,
    MultipartCompleteResponse,
    MultipartCreateRequest,
    MultipartCreateResponse,
    PartUrl,
    PartUrlsRequest,
    PartUrlsResponse,
    UploadedPart,
    UploadedPartsResponse,
    UploadRef,
)
from app.services.storage.base import BaseStorageService
from app.services.storage.factory import get_storage_service
from app.services.storage.keys import normalize_key

router = APIRouter(prefix="/uploads/multipart", tags=["Uploads"])

PART_URL_TTL_SECONDS = 3600


@router.post("", response_model=MultipartCreateResponse)
def create_multipart_upload(
    payload: MultipartCreateRequest,
    storage: BaseStorageService = Depends(get_storage_service),
):
    """Start a multipart upload for a large file. The server chooses the part size."""
    key = normalize_key(payload.key)
    check_upload_size(payload.size)
    info = storage.create_multipart_upload(
        key, payload.content_type, payload.size, allow_overwrite=payload.overwrite
    )
    return MultipartCreateResponse(
        key=key, upload_id=info.upload_id, part_size=info.part_size, part_count=info.part_count
    )


@router.post("/parts", response_model=PartUrlsResponse)
def presign_parts(
    payload: PartUrlsRequest,
    storage: BaseStorageService = Depends(get_storage_service),
):
    """Presigned PUT URLs for specific parts, requested just before each part is sent."""
    urls = storage.presign_upload_parts(
        normalize_key(payload.key),
        payload.upload_id,
        sorted(set(payload.part_numbers))[:MAX_PART_URLS_PER_REQUEST],
        expires_in=PART_URL_TTL_SECONDS,
    )
    return PartUrlsResponse(
        parts=[PartUrl(part_number=n, url=u) for n, u in urls], expires_in=PART_URL_TTL_SECONDS
    )


@router.get("/parts", response_model=UploadedPartsResponse)
def list_uploaded_parts(
    key: str = Query(...),
    upload_id: str = Query(..., min_length=1, max_length=UPLOAD_ID_MAX_LENGTH),
    storage: BaseStorageService = Depends(get_storage_service),
):
    """Parts already stored, so an interrupted upload can resume where it stopped."""
    parts = storage.list_uploaded_parts(normalize_key(key), upload_id)
    return UploadedPartsResponse(
        parts=[UploadedPart(part_number=p.part_number, size=p.size, etag=p.etag) for p in parts]
    )


@router.post("/complete", response_model=MultipartCompleteResponse)
def complete_multipart_upload(
    payload: MultipartCompleteRequest,
    storage: BaseStorageService = Depends(get_storage_service),
):
    """Assemble the uploaded parts into the final object."""
    key = normalize_key(payload.key)
    etag = storage.complete_multipart_upload(key, payload.upload_id, payload.part_count)
    return MultipartCompleteResponse(success=True, key=key, etag=etag)


@router.post("/abort", response_model=MultipartAbortResponse)
def abort_multipart_upload(
    payload: UploadRef,
    storage: BaseStorageService = Depends(get_storage_service),
):
    """Cancel an upload and discard the parts stored so far."""
    storage.abort_multipart_upload(normalize_key(payload.key), payload.upload_id)
    return MultipartAbortResponse(success=True)
