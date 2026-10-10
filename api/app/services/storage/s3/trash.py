"""The trash: deleted items wait in the bucket under a reserved prefix until they are restored.

Layout, for a batch deleted by one action:

    .cloudvault-trash/<id>.json      what was deleted (the manifest)
    .cloudvault-trash/<id>/<key>     the objects, under their original keys

The id is the deletion time plus a random suffix, so batches sort by age and need no database.
"""

import json
import logging
import re
import secrets
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from botocore.exceptions import ClientError

from app.schemas.trash import TrashBatch, TrashFailure, TrashRoot
from app.services.storage.exceptions import (
    ObjectExistsError,
    ObjectNotFoundError,
    StorageError,
)
from app.services.storage.keys import TRASH_PREFIX
from app.services.storage.s3.errors import NOT_FOUND_CODES, error_code, storage_errors

if TYPE_CHECKING:
    from app.services.storage.s3.service import S3StorageService

logger = logging.getLogger(__name__)

BATCH_ID = re.compile(r"^\d{8}T\d{6}Z-[0-9a-f]{6}$")
_TIME_FORMAT = "%Y%m%dT%H%M%SZ"


def new_batch_id(now: datetime | None = None) -> str:
    return (now or datetime.now(UTC)).strftime(_TIME_FORMAT) + "-" + secrets.token_hex(3)


def batch_time(batch_id: str) -> datetime:
    return datetime.strptime(batch_id[:16], _TIME_FORMAT).replace(tzinfo=UTC)


def manifest_key(batch_id: str) -> str:
    return f"{TRASH_PREFIX}{batch_id}.json"


def data_prefix(batch_id: str) -> str:
    return f"{TRASH_PREFIX}{batch_id}/"


def _left_behind(count: int) -> str:
    return f"Moved to the trash, but {count} items could not be removed from the folder"


def check_batch_id(batch_id: str) -> str:
    if not BATCH_ID.match(batch_id):
        raise ObjectNotFoundError("That item is not in the trash")
    return batch_id


class S3Trash:
    """Trash operations on top of the S3 service's client and copy/delete helpers."""

    def __init__(self, service: "S3StorageService") -> None:
        self._service = service

    @property
    def _client(self):
        return self._service.client

    @property
    def _bucket(self) -> str:
        return self._service.bucket

    # --- reading the trash ---------------------------------------------------------

    def _list_sized(self, prefix: str) -> list[tuple[str, int]]:
        """Every (key, size) under a prefix."""
        found: list[tuple[str, int]] = []
        paginator = self._client.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=self._bucket, Prefix=prefix):
            found.extend((obj["Key"], obj.get("Size", 0)) for obj in page.get("Contents", []))
        return found

    def _write_manifest(self, batch_id: str, roots: list[TrashRoot]) -> None:
        body = json.dumps(
            {
                "id": batch_id,
                "deleted_at": batch_time(batch_id).isoformat(),
                "roots": [root.model_dump() for root in roots],
            }
        )
        self._client.put_object(
            Bucket=self._bucket,
            Key=manifest_key(batch_id),
            Body=body.encode("utf-8"),
            ContentType="application/json",
        )

    def _read_batch(self, batch_id: str) -> TrashBatch | None:
        """The batch, or None when its manifest is missing or unreadable."""
        try:
            response = self._client.get_object(Bucket=self._bucket, Key=manifest_key(batch_id))
            data = json.loads(response["Body"].read())
            roots = [TrashRoot(**root) for root in data["roots"]]
        except ClientError as e:
            if error_code(e) in NOT_FOUND_CODES:
                return None
            raise
        except (ValueError, KeyError, TypeError):
            logger.warning("Ignoring an unreadable trash manifest for %s", batch_id)
            return None
        return TrashBatch(
            id=batch_id,
            deleted_at=batch_time(batch_id),
            roots=roots,
            total_size=sum(root.size for root in roots),
        )

    def list_trash(self, limit: int = 200) -> list[TrashBatch]:
        with storage_errors("listing the trash"):
            ids: list[str] = []
            paginator = self._client.get_paginator("list_objects_v2")
            for page in paginator.paginate(Bucket=self._bucket, Prefix=TRASH_PREFIX, Delimiter="/"):
                for obj in page.get("Contents", []):
                    name = obj["Key"][len(TRASH_PREFIX) :]
                    if name.endswith(".json") and BATCH_ID.match(name[:-5]):
                        ids.append(name[:-5])
            batches = (self._read_batch(batch_id) for batch_id in sorted(ids, reverse=True)[:limit])
            return [batch for batch in batches if batch is not None]

    # --- moving things in -----------------------------------------------------------

    def _move_file(self, key: str, base: str) -> TrashRoot:
        size = self._client.head_object(Bucket=self._bucket, Key=key).get("ContentLength", 0)
        self._service._copy_one(key, base + key)
        try:
            self._client.delete_object(Bucket=self._bucket, Key=key)
        except Exception as e:
            self._service._delete_keys(
                [base + key]
            )  # nothing was lost: put things back as they were
            raise StorageError("The file could not be removed from its folder") from e
        return TrashRoot(path=key, type="file", size=size, item_count=1)

    def _move_folder(self, prefix: str, base: str) -> tuple[TrashRoot, int]:
        """Returns the root and how many originals could not be removed afterwards."""
        objects = self._list_sized(prefix)
        if not objects:
            raise ObjectNotFoundError("Folder not found")

        copied: list[str] = []
        try:
            for key, _ in objects:
                self._service._copy_one(key, base + key)
                copied.append(base + key)
        except Exception:
            logger.error(
                "Moving '%s' to the trash failed after %d objects; undoing", prefix, len(copied)
            )
            try:
                self._service._delete_keys(copied)
            except Exception as rollback_error:
                logger.error("Undo failed: %s", rollback_error)
            raise

        left_behind = self._service._delete_keys([key for key, _ in objects])
        files = [(key, size) for key, size in objects if not key.endswith("/")]
        root = TrashRoot(
            path=prefix, type="folder", size=sum(size for _, size in files), item_count=len(files)
        )
        return root, len(left_behind)

    def move_to_trash(
        self, items: list[tuple[str, str]]
    ) -> tuple[TrashBatch | None, list[TrashFailure]]:
        batch_id = new_batch_id()
        base = data_prefix(batch_id)
        roots: list[TrashRoot] = []
        failures: list[TrashFailure] = []

        for kind, path in items:
            try:
                with storage_errors("moving to the trash"):
                    if kind == "file":
                        roots.append(self._move_file(path, base))
                    else:
                        root, left_behind = self._move_folder(path, base)
                        roots.append(root)
                        if left_behind:
                            failures.append(
                                TrashFailure(path=path, error=_left_behind(left_behind))
                            )
            except StorageError as e:
                failures.append(TrashFailure(path=path, error=e.detail))

        if not roots:
            return None, failures
        with storage_errors("moving to the trash"):
            self._write_manifest(batch_id, roots)
        batch = TrashBatch(
            id=batch_id,
            deleted_at=batch_time(batch_id),
            roots=roots,
            total_size=sum(root.size for root in roots),
        )
        return batch, failures

    # --- putting things back --------------------------------------------------------

    def _restore_root(self, root: TrashRoot, base: str) -> None:
        taken = ObjectExistsError(
            "Something with this name already exists where it was deleted from"
        )
        if root.type == "file":
            if self._service._exists(root.path):
                raise taken
            self._service._copy_one(base + root.path, root.path)
            self._service._delete_keys([base + root.path])
            return

        if self._service._prefix_has_objects(root.path):
            raise taken
        keys = self._service._list_keys(base + root.path)
        if not keys:
            raise ObjectNotFoundError("The folder is no longer in the trash")
        for key in keys:
            self._service._copy_one(key, key[len(base) :])
        self._service._delete_keys(keys)

    def restore_from_trash(self, batch_id: str) -> tuple[list[str], list[TrashFailure]]:
        check_batch_id(batch_id)
        base = data_prefix(batch_id)
        with storage_errors("restoring from the trash"):
            batch = self._read_batch(batch_id)
        if batch is None:
            raise ObjectNotFoundError("That item is no longer in the trash")

        restored: list[str] = []
        failures: list[TrashFailure] = []
        remaining: list[TrashRoot] = []
        for root in batch.roots:
            try:
                with storage_errors("restoring from the trash"):
                    self._restore_root(root, base)
                restored.append(root.path)
            except StorageError as e:
                failures.append(TrashFailure(path=root.path, error=e.detail))
                remaining.append(root)

        with storage_errors("restoring from the trash"):
            if remaining:
                self._write_manifest(batch_id, remaining)
            else:
                self._purge_keys(self._batch_keys(batch_id))
        return restored, failures

    # --- removing for good ----------------------------------------------------------

    def _batch_keys(self, batch_id: str) -> list[str]:
        return [*self._service._list_keys(data_prefix(batch_id)), manifest_key(batch_id)]

    def _purge_keys(self, keys: list[str]) -> int:
        failed = self._service._delete_keys(keys)
        if failed:
            logger.error("Could not delete %d objects from the trash", len(failed))
            raise StorageError(f"{len(failed)} items could not be deleted")
        return len(keys)

    def purge_trash(self, batch_id: str | None = None) -> int:
        with storage_errors("emptying the trash"):
            if batch_id is None:
                return self._purge_keys(self._service._list_keys(TRASH_PREFIX))
            return self._purge_keys(self._batch_keys(check_batch_id(batch_id)))
