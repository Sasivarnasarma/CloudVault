from abc import ABC, abstractmethod
from typing import List, Optional, Tuple
from app.schemas.storage import (
    FolderItem,
    ObjectMetadata,
    PresignedDownloadData,
    PresignedUploadData,
)


class BaseStorageService(ABC):
    @abstractmethod
    def list_objects(
        self, prefix: str = "", delimiter: str = "/"
    ) -> Tuple[List[FolderItem], List[ObjectMetadata]]:
        """List folders and objects at a specific prefix with a delimiter."""
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
    def check_connection(self) -> bool:
        """Check connection and bucket existence with storage backend."""
        pass
