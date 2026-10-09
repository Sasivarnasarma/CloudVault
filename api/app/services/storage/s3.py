import logging
import mimetypes
import re
from contextlib import contextmanager
from typing import Iterator, List, Optional, Tuple
from urllib.parse import quote

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

from app.core.config import settings
from app.core.limits import MAX_PARTS, choose_part_size
from app.schemas.storage import (
    FolderItem,
    MultipartUploadInfo,
    ObjectMetadata,
    PresignedDownloadData,
    PresignedUploadData,
    UploadedPartInfo,
)
from app.services.storage.base import BaseStorageService
from app.services.storage.exceptions import (
    InvalidKeyError,
    PayloadTooLargeError,
    ObjectExistsError,
    ObjectNotFoundError,
    StorageAccessError,
    StorageError,
    StorageUnavailableError,
    UploadIncompleteError,
)
from app.services.storage.keys import normalize_folder, normalize_key, normalize_prefix

logger = logging.getLogger(__name__)

# Types the platform mimetypes database often lacks (notably on Windows).
for _ext, _type in {
    ".md": "text/markdown",
    ".log": "text/plain",
    ".yml": "application/yaml",
    ".yaml": "application/yaml",
    ".webp": "image/webp",
    ".avif": "image/avif",
}.items():
    mimetypes.add_type(_type, _ext)

_NOT_FOUND_CODES = {"404", "NoSuchKey", "NotFound"}
_ACCESS_CODES = {"AccessDenied", "InvalidAccessKeyId", "SignatureDoesNotMatch", "403"}
_FILENAME_UNSAFE = re.compile(r'[\x00-\x1f\x7f"\\;]')


def _extract_name_from_key(key: str) -> str:
    """Display name (last path segment) of an object key or folder prefix."""
    return key.rstrip("/").rsplit("/", 1)[-1]


def content_disposition(filename: str) -> str:
    """Build a safe attachment header (ASCII fallback + RFC 5987 UTF-8 name)."""
    cleaned = _FILENAME_UNSAFE.sub("_", filename).strip() or "download"
    ascii_name = cleaned.encode("ascii", "replace").decode("ascii").replace("?", "_")
    return f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(cleaned, safe='')}"


@contextmanager
def _storage_errors(action: str) -> Iterator[None]:
    """Translate boto3 failures into provider-independent StorageErrors."""
    try:
        yield
    except StorageError:
        raise
    except ClientError as e:
        code = str(e.response.get("Error", {}).get("Code", ""))
        logger.error("Storage error while %s: %s", action, e)
        if code in _NOT_FOUND_CODES:
            raise ObjectNotFoundError() from e
        if code == "NoSuchBucket":
            raise StorageUnavailableError("The configured bucket does not exist") from e
        if code in _ACCESS_CODES:
            raise StorageAccessError() from e
        if code == "NoSuchUpload":
            raise ObjectNotFoundError("The upload was not found. It may have been completed or cancelled") from e
        if code == "InvalidPart":
            raise UploadIncompleteError("Some uploaded parts are missing or damaged") from e
        if code == "EntityTooLarge":
            raise PayloadTooLargeError("The object is too large to copy in one step") from e
        raise StorageError(f"Storage failed while {action}") from e
    except BotoCoreError as e:
        logger.error("Storage connection error while %s: %s", action, e)
        raise StorageUnavailableError() from e


class S3StorageService(BaseStorageService):
    def __init__(self) -> None:
        self.bucket = settings.S3_BUCKET
        self.provider = settings.STORAGE_PROVIDER

        client_kwargs = {
            "service_name": "s3",
            "region_name": settings.S3_REGION,
            "aws_access_key_id": settings.S3_ACCESS_KEY,
            "aws_secret_access_key": settings.S3_SECRET_KEY,
            "config": Config(
                signature_version="s3v4",
                s3={"addressing_style": settings.S3_ADDRESSING_STYLE},
            ),
        }
        if settings.S3_ENDPOINT:
            client_kwargs["endpoint_url"] = settings.S3_ENDPOINT

        self.client = boto3.client(**client_kwargs)

    def check_connection(self) -> bool:
        try:
            self.client.head_bucket(Bucket=self.bucket)
            return True
        except Exception as e:
            logger.warning("Storage connection check failed for bucket '%s': %s", self.bucket, e)
            return False

    def _exists(self, key: str) -> bool:
        try:
            self.client.head_object(Bucket=self.bucket, Key=key)
            return True
        except ClientError as e:
            if str(e.response.get("Error", {}).get("Code", "")) in _NOT_FOUND_CODES:
                return False
            raise

    def _prefix_has_objects(self, prefix: str) -> bool:
        res = self.client.list_objects_v2(Bucket=self.bucket, Prefix=prefix, MaxKeys=1)
        return res.get("KeyCount", 0) > 0

    def list_objects(
        self, prefix: str = "", delimiter: str = "/"
    ) -> Tuple[List[FolderItem], List[ObjectMetadata]]:
        norm_prefix = normalize_prefix(prefix)
        folders: List[FolderItem] = []
        objects: List[ObjectMetadata] = []

        with _storage_errors("listing objects"):
            paginator = self.client.get_paginator("list_objects_v2")
            for page in paginator.paginate(Bucket=self.bucket, Prefix=norm_prefix, Delimiter=delimiter):
                for cp in page.get("CommonPrefixes", []):
                    folders.append(
                        FolderItem(name=_extract_name_from_key(cp["Prefix"]), prefix=cp["Prefix"])
                    )

                objects.extend(self._to_objects(page.get("Contents", []), norm_prefix))

        return folders, objects

    def list_page(
        self, prefix: str = "", limit: int = 500, cursor: Optional[str] = None
    ) -> Tuple[List[FolderItem], List[ObjectMetadata], Optional[str]]:
        norm_prefix = normalize_prefix(prefix)
        params = {"Bucket": self.bucket, "Prefix": norm_prefix, "Delimiter": "/", "MaxKeys": limit}
        if cursor:
            params["ContinuationToken"] = cursor

        with _storage_errors("listing objects"):
            try:
                page = self.client.list_objects_v2(**params)
            except ClientError as e:
                status = e.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
                code = str(e.response.get("Error", {}).get("Code", ""))
                # AWS reports InvalidArgument, R2 reports InvalidContinuation; both are a 400.
                if cursor and (status == 400 or code in ("InvalidArgument", "InvalidContinuation")):
                    raise InvalidKeyError("Invalid pagination cursor") from e
                raise

        folders = [
            FolderItem(name=_extract_name_from_key(cp["Prefix"]), prefix=cp["Prefix"])
            for cp in page.get("CommonPrefixes", [])
        ]
        objects = self._to_objects(page.get("Contents", []), norm_prefix)
        next_cursor = page.get("NextContinuationToken") if page.get("IsTruncated") else None
        return folders, objects, next_cursor

    @staticmethod
    def _to_objects(contents: List[dict], norm_prefix: str) -> List[ObjectMetadata]:
        objects: List[ObjectMetadata] = []
        for obj in contents:
            key = obj["Key"]
            # Skip the folder's own marker and nested 0-byte markers.
            if key == norm_prefix or key.endswith("/"):
                continue
            content_type, _ = mimetypes.guess_type(key)
            objects.append(
                ObjectMetadata(
                    key=key,
                    name=_extract_name_from_key(key),
                    size=obj.get("Size", 0),
                    content_type=content_type or "application/octet-stream",
                    last_modified=obj["LastModified"],
                    etag=obj.get("ETag", "").strip('"'),
                )
            )
        return objects

    def get_object_metadata(self, key: str) -> ObjectMetadata:
        norm_key = normalize_key(key)
        with _storage_errors("reading object metadata"):
            response = self.client.head_object(Bucket=self.bucket, Key=norm_key)
            return ObjectMetadata(
                key=norm_key,
                name=_extract_name_from_key(norm_key),
                size=response.get("ContentLength", 0),
                content_type=response.get("ContentType", "application/octet-stream"),
                last_modified=response["LastModified"],
                etag=response.get("ETag", "").strip('"'),
                metadata=response.get("Metadata", {}),
            )

    def create_folder(self, folder_path: str) -> FolderItem:
        norm_folder = normalize_folder(folder_path)
        with _storage_errors("creating folder"):
            if self._exists(norm_folder) or self._prefix_has_objects(norm_folder):
                raise ObjectExistsError("A folder with this name already exists")
            self.client.put_object(Bucket=self.bucket, Key=norm_folder, Body=b"")
            return FolderItem(name=_extract_name_from_key(norm_folder), prefix=norm_folder)

    def delete_object(self, key: str) -> bool:
        norm_key = normalize_key(key)
        with _storage_errors("deleting object"):
            self.client.delete_object(Bucket=self.bucket, Key=norm_key)
        return True

    def delete_folder(self, prefix: str) -> int:
        norm_prefix = normalize_folder(prefix)  # never empty: the bucket root cannot be deleted
        deleted_count = 0
        failed: List[str] = []

        with _storage_errors("deleting folder"):
            paginator = self.client.get_paginator("list_objects_v2")
            for page in paginator.paginate(Bucket=self.bucket, Prefix=norm_prefix):
                batch = [{"Key": obj["Key"]} for obj in page.get("Contents", [])]
                if not batch:
                    continue
                result = self.client.delete_objects(Bucket=self.bucket, Delete={"Objects": batch})
                deleted_count += len(result.get("Deleted", []))
                failed.extend(err.get("Key", "?") for err in result.get("Errors", []))

        if failed:
            logger.error("Failed to delete %d objects under '%s'", len(failed), norm_prefix)
            raise StorageError(
                f"Deleted {deleted_count} items, but {len(failed)} could not be deleted"
            )
        return deleted_count

    def _copy_one(self, source_key: str, destination_key: str) -> None:
        self.client.copy_object(
            Bucket=self.bucket,
            Key=destination_key,
            CopySource={"Bucket": self.bucket, "Key": source_key},
        )

    def _delete_keys(self, keys: List[str]) -> List[str]:
        """Delete keys in batches of 1000. Returns the keys that could not be deleted."""
        failed: List[str] = []
        for start in range(0, len(keys), 1000):
            batch = [{"Key": key} for key in keys[start : start + 1000]]
            result = self.client.delete_objects(Bucket=self.bucket, Delete={"Objects": batch})
            failed.extend(err.get("Key", "?") for err in result.get("Errors", []))
        return failed

    def _list_keys(self, prefix: str) -> List[str]:
        keys: List[str] = []
        paginator = self.client.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=self.bucket, Prefix=prefix):
            keys.extend(obj["Key"] for obj in page.get("Contents", []))
        return keys

    def copy_object(self, source_key: str, destination_key: str, allow_overwrite: bool = False) -> str:
        source = normalize_key(source_key)
        destination = normalize_key(destination_key)
        if source == destination:
            raise InvalidKeyError("Source and destination are the same")
        with _storage_errors("copying object"):
            if not self._exists(source):
                raise ObjectNotFoundError()
            if not allow_overwrite and self._exists(destination):
                raise ObjectExistsError("A file with this name already exists")
            self._copy_one(source, destination)
        return destination

    def move_object(self, source_key: str, destination_key: str, allow_overwrite: bool = False) -> str:
        source = normalize_key(source_key)
        destination = self.copy_object(source, destination_key, allow_overwrite)
        try:
            self.delete_object(source)
        except StorageError as e:
            raise StorageError("The file was copied, but the original could not be removed") from e
        return destination

    @staticmethod
    def _folder_pair(source_prefix: str, destination_prefix: str) -> Tuple[str, str]:
        source = normalize_folder(source_prefix)
        destination = normalize_folder(destination_prefix)
        if source == destination:
            raise InvalidKeyError("Source and destination are the same")
        if destination.startswith(source):
            raise InvalidKeyError("A folder cannot be moved or copied into itself")
        return source, destination

    def _copy_folder_keys(self, source: str, destination: str) -> List[str]:
        """Copy everything under `source`, rolling back on failure. Returns the source keys."""
        keys = self._list_keys(source)
        if not keys:
            raise ObjectNotFoundError("Folder not found")
        if self._prefix_has_objects(destination):
            raise ObjectExistsError("A folder with this name already exists")

        copied: List[str] = []
        try:
            for key in keys:
                target = destination + key[len(source):]
                self._copy_one(key, target)
                copied.append(target)
        except Exception:
            logger.error(
                "Folder copy '%s' -> '%s' failed after %d/%d objects; rolling back",
                source, destination, len(copied), len(keys),
            )
            try:
                self._delete_keys(copied)
            except Exception as rollback_error:  # noqa: BLE001
                logger.error("Rollback failed: %s", rollback_error)
            raise
        return keys

    def copy_folder(self, source_prefix: str, destination_prefix: str) -> int:
        source, destination = self._folder_pair(source_prefix, destination_prefix)
        with _storage_errors("copying folder"):
            return len(self._copy_folder_keys(source, destination))

    def move_folder(self, source_prefix: str, destination_prefix: str) -> int:
        source, destination = self._folder_pair(source_prefix, destination_prefix)
        with _storage_errors("moving folder"):
            keys = self._copy_folder_keys(source, destination)
            failed = self._delete_keys(keys)
        if failed:
            raise StorageError(
                f"The folder was copied, but {len(failed)} original items could not be removed"
            )
        return len(keys)

    def generate_upload_url(
        self,
        key: str,
        content_type: str,
        expires_in: int = 900,
        allow_overwrite: bool = False,
    ) -> PresignedUploadData:
        norm_key = normalize_key(key)
        with _storage_errors("generating upload URL"):
            if not allow_overwrite and self._exists(norm_key):
                raise ObjectExistsError("A file with this name already exists")
            upload_url = self.client.generate_presigned_url(
                ClientMethod="put_object",
                Params={"Bucket": self.bucket, "Key": norm_key, "ContentType": content_type},
                ExpiresIn=expires_in,
            )
        return PresignedUploadData(
            upload_url=upload_url,
            method="PUT",
            headers={"Content-Type": content_type},
            key=norm_key,
            expires_in=expires_in,
        )

    # --- multipart uploads --------------------------------------------------------

    def create_multipart_upload(
        self, key: str, content_type: str, size: int, allow_overwrite: bool = False
    ) -> MultipartUploadInfo:
        norm_key = normalize_key(key)
        part_size = choose_part_size(size)
        part_count = -(-size // part_size)
        with _storage_errors("starting multipart upload"):
            if not allow_overwrite and self._exists(norm_key):
                raise ObjectExistsError("A file with this name already exists")
            response = self.client.create_multipart_upload(
                Bucket=self.bucket, Key=norm_key, ContentType=content_type
            )
        return MultipartUploadInfo(upload_id=response["UploadId"], part_size=part_size, part_count=part_count)

    def presign_upload_parts(
        self, key: str, upload_id: str, part_numbers: List[int], expires_in: int = 3600
    ) -> List[Tuple[int, str]]:
        norm_key = normalize_key(key)
        if any(n < 1 or n > MAX_PARTS for n in part_numbers):
            raise InvalidKeyError(f"Part numbers must be between 1 and {MAX_PARTS}")
        with _storage_errors("generating part upload URLs"):
            return [
                (
                    number,
                    self.client.generate_presigned_url(
                        ClientMethod="upload_part",
                        Params={
                            "Bucket": self.bucket,
                            "Key": norm_key,
                            "UploadId": upload_id,
                            "PartNumber": number,
                        },
                        ExpiresIn=expires_in,
                    ),
                )
                for number in part_numbers
            ]

    def _list_parts(self, key: str, upload_id: str) -> List[UploadedPartInfo]:
        parts: List[UploadedPartInfo] = []
        paginator = self.client.get_paginator("list_parts")
        for page in paginator.paginate(Bucket=self.bucket, Key=key, UploadId=upload_id):
            parts.extend(
                UploadedPartInfo(part_number=p["PartNumber"], size=p["Size"], etag=p["ETag"])
                for p in page.get("Parts", [])
            )
        return sorted(parts, key=lambda p: p.part_number)

    def list_uploaded_parts(self, key: str, upload_id: str) -> List[UploadedPartInfo]:
        norm_key = normalize_key(key)
        with _storage_errors("listing uploaded parts"):
            return self._list_parts(norm_key, upload_id)

    def complete_multipart_upload(self, key: str, upload_id: str, part_count: int) -> Optional[str]:
        norm_key = normalize_key(key)
        with _storage_errors("completing multipart upload"):
            # ETags come from storage, so the browser never has to read them (no CORS ExposeHeaders needed).
            parts = self._list_parts(norm_key, upload_id)
            present = {p.part_number for p in parts}
            missing = [n for n in range(1, part_count + 1) if n not in present]
            if missing or len(parts) != part_count:
                shown = ", ".join(str(n) for n in missing[:10])
                raise UploadIncompleteError(
                    f"{len(missing)} part(s) are missing" + (f" (e.g. {shown})" if missing else "")
                )
            response = self.client.complete_multipart_upload(
                Bucket=self.bucket,
                Key=norm_key,
                UploadId=upload_id,
                MultipartUpload={"Parts": [{"ETag": p.etag, "PartNumber": p.part_number} for p in parts]},
            )
        etag = response.get("ETag")
        return etag.strip('"') if etag else None

    def abort_multipart_upload(self, key: str, upload_id: str) -> None:
        norm_key = normalize_key(key)
        with _storage_errors("aborting multipart upload"):
            self.client.abort_multipart_upload(Bucket=self.bucket, Key=norm_key, UploadId=upload_id)

    def generate_download_url(
        self, key: str, expires_in: int = 3600, filename: Optional[str] = None
    ) -> PresignedDownloadData:
        norm_key = normalize_key(key)
        params = {"Bucket": self.bucket, "Key": norm_key}
        if filename:
            params["ResponseContentDisposition"] = content_disposition(filename)

        with _storage_errors("generating download URL"):
            download_url = self.client.generate_presigned_url(
                ClientMethod="get_object", Params=params, ExpiresIn=expires_in
            )
        return PresignedDownloadData(download_url=download_url, key=norm_key, expires_in=expires_in)

