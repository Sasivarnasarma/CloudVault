"""Request checks shared by the upload routes."""

from app.core.config import settings
from app.core.limits import GIB, MIB, SINGLE_UPLOAD_MAX_BYTES, TIB
from app.services.storage.exceptions import PayloadTooLargeError


def _human_size(size: int) -> str:
    """5368709120 -> "5 GiB". Uses the largest unit that fits (TiB, GiB or MiB)."""
    if size >= TIB:
        return f"{size // TIB} TiB"
    return f"{size // GIB} GiB" if size >= GIB else f"{size // MIB} MiB"


def check_upload_size(size: int | None, *, single_request: bool = False) -> None:
    """Refuse a file that is over the configured limit.

    With `single_request` it must also fit in one presigned PUT; bigger files go in parts.
    `size` may be None when the client did not say how big the file is.
    """
    if size is None:
        return
    if size > settings.MAX_UPLOAD_BYTES:
        raise PayloadTooLargeError(
            f"File exceeds the {_human_size(settings.MAX_UPLOAD_BYTES)} upload limit"
        )
    if single_request and size > SINGLE_UPLOAD_MAX_BYTES:
        raise PayloadTooLargeError(
            f"Files over {_human_size(SINGLE_UPLOAD_MAX_BYTES)} must be uploaded in parts"
        )
