from abc import ABC, abstractmethod
from typing import List, Optional, Tuple
from app.schemas.storage import (
    FolderItem,
    MultipartUploadInfo,
    ObjectMetadata,
    PresignedDownloadData,
    PresignedUploadData,
    UploadedPartInfo,
)


class BaseStorageService(ABC):
    @abstractmethod
    def list_objects(
        self, prefix: str = "", delimiter: str = "/"
    ) -> Tuple[List[FolderItem], List[ObjectMetadata]]:
        """List folders and objects at a specific prefix with a delimiter."""
        pass

    @abstractmethod
    def list_page(
        self, prefix: str = "", limit: int = 500, cursor: Optional[str] = None
    ) -> Tuple[List[FolderItem], List[ObjectMetadata], Optional[str]]:
        """List one page of folders and objects at a prefix.

        Returns (folders, objects, next_cursor); `next_cursor` is None on the last page.
        """
        pass

    @abstractmethod
    def get_object_metadata(self, key: str) -> ObjectMetadata:
        """Get detailed metadata for a specific object key."""
        pass

    @abstractmethod
    def create_folder(self, folder_path: str) -> FolderItem:
        """Create a new virtual folder marker object.

        Raises ObjectExistsError if the folder already exists.
        """
        pass

    @abstractmethod
    def delete_object(self, key: str) -> bool:
        """Delete a single object key from storage."""
        pass

    @abstractmethod
    def delete_folder(self, prefix: str) -> int:
        """Recursively delete all objects under a folder prefix.

        Refuses to run on an empty prefix (the bucket root).
        """
        pass

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
        pass

    @abstractmethod
    def generate_download_url(
        self, key: str, expires_in: int = 3600, filename: Optional[str] = None
    ) -> PresignedDownloadData:
        """Generate a presigned GET URL for direct client download."""
        pass

    @abstractmethod
    def copy_object(self, source_key: str, destination_key: str, allow_overwrite: bool = False) -> str:
        """Copy one object. Returns the destination key.

        Raises ObjectNotFoundError if the source is missing and ObjectExistsError if the
        destination exists and `allow_overwrite` is False.
        """
        pass

    @abstractmethod
    def move_object(self, source_key: str, destination_key: str, allow_overwrite: bool = False) -> str:
        """Copy an object to a new key, then remove the original. Returns the destination key."""
        pass

    @abstractmethod
    def copy_folder(self, source_prefix: str, destination_prefix: str) -> int:
        """Recursively copy a folder. Never overwrites; returns the number of objects copied."""
        pass

    @abstractmethod
    def move_folder(self, source_prefix: str, destination_prefix: str) -> int:
        """Recursively move a folder. Never overwrites; returns the number of objects moved."""
        pass

    @abstractmethod
    def create_multipart_upload(
        self, key: str, content_type: str, size: int, allow_overwrite: bool = False
    ) -> MultipartUploadInfo:
        """Start a multipart upload and decide the part size."""
        pass

    @abstractmethod
    def presign_upload_parts(
        self, key: str, upload_id: str, part_numbers: List[int], expires_in: int = 3600
    ) -> List[Tuple[int, str]]:
        """Presigned PUT URLs for the given part numbers, as (part_number, url) pairs."""
        pass

    @abstractmethod
    def list_uploaded_parts(self, key: str, upload_id: str) -> List[UploadedPartInfo]:
        """Parts already stored for an upload (used to resume)."""
        pass

    @abstractmethod
    def complete_multipart_upload(self, key: str, upload_id: str, part_count: int) -> Optional[str]:
        """Assemble the uploaded parts into the object. Returns its ETag."""
        pass

    @abstractmethod
    def abort_multipart_upload(self, key: str, upload_id: str) -> None:
        """Discard an upload and free the storage used by its parts."""
        pass

    @abstractmethod
    def check_connection(self) -> bool:
        """Check connection and bucket existence with storage backend."""
        pass
