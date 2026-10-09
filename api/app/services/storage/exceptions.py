"""Provider-independent storage errors.

Routes never see boto3/botocore types: the storage service translates provider
failures into these exceptions, and `app.main` maps them to HTTP responses.
"""


class StorageError(Exception):
    """Base class for storage failures. `detail` is safe to show to clients."""

    status_code = 502
    detail = "Storage request failed"

    def __init__(self, detail: str | None = None):
        self.detail = detail or self.detail
        super().__init__(self.detail)


class InvalidKeyError(StorageError):
    status_code = 400
    detail = "Invalid object key"


class ObjectNotFoundError(StorageError):
    status_code = 404
    detail = "Object not found"


class ObjectExistsError(StorageError):
    status_code = 409
    detail = "Object already exists"


class PayloadTooLargeError(StorageError):
    status_code = 413
    detail = "File is too large"


class StorageAccessError(StorageError):
    status_code = 502
    detail = "Storage rejected the configured credentials or permissions"


class StorageUnavailableError(StorageError):
    status_code = 503
    detail = "Storage service is unavailable"


class UploadIncompleteError(StorageError):
    status_code = 409
    detail = "Some parts of the upload are missing"
