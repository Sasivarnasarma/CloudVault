"""Translate boto3 failures into provider-independent storage errors."""

import logging
from collections.abc import Iterator
from contextlib import contextmanager

from botocore.exceptions import BotoCoreError, ClientError

from app.services.storage.exceptions import (
    ObjectNotFoundError,
    PayloadTooLargeError,
    StorageAccessError,
    StorageError,
    StorageUnavailableError,
    UploadIncompleteError,
)

logger = logging.getLogger(__name__)

NOT_FOUND_CODES = {"404", "NoSuchKey", "NotFound"}
ACCESS_CODES = {"AccessDenied", "InvalidAccessKeyId", "SignatureDoesNotMatch", "403"}


def error_code(error: ClientError) -> str:
    """The provider's error code for a failed request, e.g. "NoSuchKey"."""
    return str(error.response.get("Error", {}).get("Code", ""))


def http_status(error: ClientError) -> int | None:
    return error.response.get("ResponseMetadata", {}).get("HTTPStatusCode")


@contextmanager
def storage_errors(action: str) -> Iterator[None]:
    """Run storage calls for `action`; failures leave as StorageErrors that are safe to show."""
    try:
        yield
    except StorageError:
        raise
    except ClientError as e:
        code = error_code(e)
        logger.error("Storage error while %s: %s", action, e)
        if code in NOT_FOUND_CODES:
            raise ObjectNotFoundError() from e
        if code == "NoSuchBucket":
            raise StorageUnavailableError("The configured bucket does not exist") from e
        if code in ACCESS_CODES:
            raise StorageAccessError() from e
        if code == "NoSuchUpload":
            raise ObjectNotFoundError(
                "The upload was not found. It may have been completed or cancelled"
            ) from e
        if code == "InvalidPart":
            raise UploadIncompleteError("Some uploaded parts are missing or damaged") from e
        if code == "EntityTooLarge":
            raise PayloadTooLargeError("The object is too large to copy in one step") from e
        raise StorageError(f"Storage failed while {action}") from e
    except BotoCoreError as e:
        logger.error("Storage connection error while %s: %s", action, e)
        raise StorageUnavailableError() from e
