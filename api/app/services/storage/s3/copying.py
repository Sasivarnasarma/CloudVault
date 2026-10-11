"""Copying objects larger than a single copy request allows (5 GiB), part by part inside storage."""

import logging
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from app.core import limits
from app.services.storage.s3.naming import DEFAULT_CONTENT_TYPE

logger = logging.getLogger(__name__)


def part_size_for(size: int) -> int:
    """A copy part size (whole MiB) that keeps the part count within the 10,000-part limit."""
    needed = -(-size // limits.MAX_PARTS)
    if needed <= limits.COPY_PART_BYTES:
        return limits.COPY_PART_BYTES
    return -(-needed // limits.MIB) * limits.MIB


def copy_in_parts(
    client: Any, bucket: str, source_key: str, destination_key: str, size: int
) -> None:
    """Copy an object as a multipart upload whose parts are copied inside storage.

    No data passes through the API. If any part fails the partial upload is aborted, so nothing is
    left behind on storage.
    """
    head = client.head_object(Bucket=bucket, Key=source_key)
    create_args: dict[str, Any] = {
        "Bucket": bucket,
        "Key": destination_key,
        "ContentType": head.get("ContentType", DEFAULT_CONTENT_TYPE),
    }
    if head.get("Metadata"):
        create_args["Metadata"] = head["Metadata"]
    upload_id = client.create_multipart_upload(**create_args)["UploadId"]

    part_size = part_size_for(size)
    ranges = [(start, min(start + part_size, size) - 1) for start in range(0, size, part_size)]

    def copy_part(item: tuple[int, tuple[int, int]]) -> dict[str, Any]:
        number = item[0] + 1
        first, last = item[1]
        result = client.upload_part_copy(
            Bucket=bucket,
            Key=destination_key,
            UploadId=upload_id,
            PartNumber=number,
            CopySource={"Bucket": bucket, "Key": source_key},
            CopySourceRange=f"bytes={first}-{last}",
        )
        return {"PartNumber": number, "ETag": result["CopyPartResult"]["ETag"]}

    try:
        with ThreadPoolExecutor(max_workers=limits.COPY_PARTS_AT_ONCE) as pool:
            parts = list(pool.map(copy_part, enumerate(ranges)))
        client.complete_multipart_upload(
            Bucket=bucket,
            Key=destination_key,
            UploadId=upload_id,
            MultipartUpload={"Parts": parts},
        )
    except BaseException:
        try:
            client.abort_multipart_upload(Bucket=bucket, Key=destination_key, UploadId=upload_id)
        except Exception:  # the original error matters more
            logger.warning("Could not abort the partial copy of %s", destination_key)
        raise
