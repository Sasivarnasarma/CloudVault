from abc import ABC, abstractmethod
from collections.abc import Callable

from app.schemas.storage import (
    FolderItem,
    MultipartUploadInfo,
    ObjectMetadata,
    PresignedDownloadData,
    PresignedUploadData,
    SearchResult,
    TreeFile,
    UploadedPartInfo,
)
from app.schemas.trash import TrashBatch, TrashFailure

ProgressCallback = Callable[[int, int], None]


class BaseStorageService(ABC):
    """What the API needs from a storage backend. Routes depend on this, never on a provider."""

    # --- connection -----------------------------------------------------------------

    @abstractmethod
    def check_connection(self) -> bool:
        """Check connection and bucket existence with storage backend."""

    # --- listing --------------------------------------------------------------------

    @abstractmethod
    def list_objects(
        self, prefix: str = "", delimiter: str = "/"
    ) -> tuple[list[FolderItem], list[ObjectMetadata]]:
        """List folders and objects at a specific prefix with a delimiter."""

    @abstractmethod
    def list_page(
        self, prefix: str = "", limit: int = 500, cursor: str | None = None
    ) -> tuple[list[FolderItem], list[ObjectMetadata], str | None]:
        """List one page of folders and objects at a prefix.

        Returns (folders, objects, next_cursor); `next_cursor` is None on the last page.
        """

    @abstractmethod
    def get_object_metadata(self, key: str) -> ObjectMetadata:
        """Get detailed metadata for a specific object key."""

    # --- folders --------------------------------------------------------------------

    @abstractmethod
    def create_folder(self, folder_path: str) -> FolderItem:
        """Create a new virtual folder marker object.

        Raises ObjectExistsError if the folder already exists.
        """

    @abstractmethod
    def delete_folder(self, prefix: str) -> int:
        """Recursively delete all objects under a folder prefix.

        Refuses to run on an empty prefix (the bucket root).
        """

    @abstractmethod
    def list_folder_tree(self, prefix: str, max_files: int) -> tuple[list[TreeFile], list[str]]:
        """Every file under a folder, however deep, and the folders that have nothing inside.

        Raises PayloadTooLargeError if there are more than `max_files` files.
        """

    @abstractmethod
    def search(self, prefix: str, query: str, limit: int, max_scan: int) -> SearchResult:
        """Files and folders under `prefix`, however deep, whose own name contains `query`.

        The match ignores case. It stops after `limit` matches or after reading `max_scan`
        objects, and says so in `truncated`.
        """

    # --- objects --------------------------------------------------------------------

    @abstractmethod
    def delete_object(self, key: str) -> bool:
        """Delete a single object key from storage."""

    @abstractmethod
    def copy_object(
        self, source_key: str, destination_key: str, allow_overwrite: bool = False
    ) -> str:
        """Copy one object. Returns the destination key.

        Raises ObjectNotFoundError if the source is missing and ObjectExistsError if the
        destination exists and `allow_overwrite` is False.
        """

    @abstractmethod
    def move_object(
        self, source_key: str, destination_key: str, allow_overwrite: bool = False
    ) -> str:
        """Copy an object to a new key, then remove the original. Returns the destination key."""

    # --- folder copies and moves ----------------------------------------------------

    @abstractmethod
    def copy_folder(
        self, source_prefix: str, destination_prefix: str, progress: ProgressCallback | None = None
    ) -> int:
        """Recursively copy a folder. Never overwrites; returns the number of objects copied.

        `progress(done, total)` is called before the first object and after each one. It may raise
        to stop the copy, which then removes what it has copied so far.
        """

    @abstractmethod
    def move_folder(
        self, source_prefix: str, destination_prefix: str, progress: ProgressCallback | None = None
    ) -> int:
        """Recursively move a folder. Never overwrites; returns the number of objects moved.

        `progress` reports the copying, the long part (see `copy_folder`).
        """

    # --- trash ----------------------------------------------------------------------

    @abstractmethod
    def move_to_trash(
        self, items: list[tuple[str, str]]
    ) -> tuple[TrashBatch | None, list[TrashFailure]]:
        """Move files and folders into the trash as one batch.

        `items` are (type, path) pairs with type "file" or "folder". Each one succeeds or fails on
        its own; the batch is None when none could be moved.
        """

    @abstractmethod
    def list_trash(self, limit: int = 200) -> list[TrashBatch]:
        """The newest batches in the trash, newest first."""

    @abstractmethod
    def restore_from_trash(
        self, batch_id: str, paths: list[str] | None = None
    ) -> tuple[list[str], list[TrashFailure]]:
        """Put a batch, or only the items of it named in `paths`, back where they were.

        Never overwrites; what cannot go back stays in the trash.
        Raises ObjectNotFoundError if the batch is not in the trash.
        """

    @abstractmethod
    def purge_trash(self, batch_id: str | None = None, paths: list[str] | None = None) -> int:
        """Delete one batch (or only the items of it named in `paths`) for good, or everything in
        the trash. Returns how many objects went."""

    # --- presigned upload -----------------------------------------------------------

    @abstractmethod
    def generate_upload_url(
        self,
        key: str,
        content_type: str,
        expires_in: int = 900,
        allow_overwrite: bool = False,
    ) -> PresignedUploadData:
        """Generate a presigned PUT URL for direct client upload.

        Raises ObjectExistsError if the key exists and `allow_overwrite` is False.
        """

    # --- multipart upload -----------------------------------------------------------

    @abstractmethod
    def create_multipart_upload(
        self, key: str, content_type: str, size: int, allow_overwrite: bool = False
    ) -> MultipartUploadInfo:
        """Start a multipart upload and decide the part size."""

    @abstractmethod
    def presign_upload_parts(
        self, key: str, upload_id: str, part_numbers: list[int], expires_in: int = 3600
    ) -> list[tuple[int, str]]:
        """Presigned PUT URLs for the given part numbers, as (part_number, url) pairs."""

    @abstractmethod
    def list_uploaded_parts(self, key: str, upload_id: str) -> list[UploadedPartInfo]:
        """Parts already stored for an upload (used to resume)."""

    @abstractmethod
    def complete_multipart_upload(self, key: str, upload_id: str, part_count: int) -> str | None:
        """Assemble the uploaded parts into the object. Returns its ETag."""

    @abstractmethod
    def abort_multipart_upload(self, key: str, upload_id: str) -> None:
        """Discard an upload and free the storage used by its parts."""

    # --- presigned download ---------------------------------------------------------

    @abstractmethod
    def generate_download_url(
        self, key: str, expires_in: int = 3600, filename: str | None = None
    ) -> PresignedDownloadData:
        """Generate a presigned GET URL for direct client download."""
