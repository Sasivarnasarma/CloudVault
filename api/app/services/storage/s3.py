import logging
import mimetypes
from datetime import datetime
from typing import List, Optional, Tuple
import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
from app.core.config import settings
from app.schemas.storage import (
    FolderItem,
    ObjectMetadata,
    PresignedDownloadData,
    PresignedUploadData,
)
from app.services.storage.base import BaseStorageService

logger = logging.getLogger(__name__)


def _normalize_prefix(prefix: str) -> str:
    """Ensure prefix does not start with slash and ends with slash if non-empty."""
    prefix = prefix.lstrip("/")
    if prefix and not prefix.endswith("/"):
        prefix += "/"
    return prefix


def _normalize_key(key: str) -> str:
    """Ensure object key does not start with leading slash."""
    return key.lstrip("/")


def _extract_name_from_key(key: str) -> str:
    """Extract display file or folder name from object key."""
    cleaned = key.rstrip("/")
    if "/" in cleaned:
        return cleaned.split("/")[-1]
    return cleaned


class S3StorageService(BaseStorageService):
    def __init__(self):
        self.bucket = settings.S3_BUCKET
        self.provider = settings.STORAGE_PROVIDER.lower()

        # Configure boto3 S3 client
        client_kwargs = {
            "service_name": "s3",
            "region_name": settings.S3_REGION,
            "aws_access_key_id": settings.S3_ACCESS_KEY,
            "aws_secret_access_key": settings.S3_SECRET_KEY,
        }

        if settings.S3_ENDPOINT:
            client_kwargs["endpoint_url"] = settings.S3_ENDPOINT

        # Configure addressing style and signature v4
        config_kwargs = {
            "signature_version": "s3v4",
            "s3": {"addressing_style": settings.S3_ADDRESSING_STYLE},
        }

        client_kwargs["config"] = Config(**config_kwargs)
        self.client = boto3.client(**client_kwargs)

    def check_connection(self) -> bool:
        """Verify storage connection and bucket access."""
        try:
            self.client.head_bucket(Bucket=self.bucket)
            return True
        except Exception as e:
            logger.warning(f"Storage connection check failed for bucket '{self.bucket}': {e}")
            return False

    def list_objects(
        self, prefix: str = "", delimiter: str = "/"
    ) -> Tuple[List[FolderItem], List[ObjectMetadata]]:
        """List folders and objects at a specific prefix with delimiter."""
        norm_prefix = _normalize_prefix(prefix) if prefix else ""
        folders: List[FolderItem] = []
        objects: List[ObjectMetadata] = []

        try:
            paginator = self.client.get_paginator("list_objects_v2")
            page_iterator = paginator.paginate(
                Bucket=self.bucket, Prefix=norm_prefix, Delimiter=delimiter
            )

            for page in page_iterator:
                # Process CommonPrefixes (subfolders)
                if "CommonPrefixes" in page:
                    for cp in page["CommonPrefixes"]:
                        folder_prefix = cp["Prefix"]
                        folder_name = _extract_name_from_key(folder_prefix)
                        folders.append(FolderItem(name=folder_name, prefix=folder_prefix))

                # Process Contents (files)
                if "Contents" in page:
                    for obj in page["Contents"]:
                        key = obj["Key"]
                        # Skip the exact prefix marker itself or 0-byte folder markers
                        if key == norm_prefix or key.endswith("/"):
                            continue

                        name = _extract_name_from_key(key)
                        size = obj.get("Size", 0)
                        last_modified = obj.get("LastModified", datetime.now())
                        etag = obj.get("ETag", "").strip('"')

                        # Guess Content-Type if missing
                        content_type, _ = mimetypes.guess_type(key)
                        if not content_type:
                            content_type = "application/octet-stream"

                        objects.append(
                            ObjectMetadata(
                                key=key,
                                name=name,
                                size=size,
                                content_type=content_type,
                                last_modified=last_modified,
                                etag=etag,
                            )
                        )

        except ClientError as e:
            logger.error(f"Error listing objects for prefix '{norm_prefix}': {e}")
            raise e

        return folders, objects

    def get_object_metadata(self, key: str) -> ObjectMetadata:
        """Get detailed metadata for a single object."""
        norm_key = _normalize_key(key)
        try:
            response = self.client.head_object(Bucket=self.bucket, Key=norm_key)
            name = _extract_name_from_key(norm_key)
            size = response.get("ContentLength", 0)
            content_type = response.get("ContentType", "application/octet-stream")
            last_modified = response.get("LastModified", datetime.now())
            etag = response.get("ETag", "").strip('"')
            custom_metadata = response.get("Metadata", {})

            return ObjectMetadata(
                key=norm_key,
                name=name,
                size=size,
                content_type=content_type,
                last_modified=last_modified,
                etag=etag,
                metadata=custom_metadata,
            )
        except ClientError as e:
            logger.error(f"Error getting metadata for key '{norm_key}': {e}")
            raise e

    def create_folder(self, folder_path: str) -> FolderItem:
        """Create a 0-byte object folder marker key ending with '/'."""
        norm_folder = _normalize_prefix(folder_path)
        try:
            self.client.put_object(Bucket=self.bucket, Key=norm_folder, Body=b"")
            folder_name = _extract_name_from_key(norm_folder)
            return FolderItem(name=folder_name, prefix=norm_folder)
        except ClientError as e:
            logger.error(f"Error creating folder '{norm_folder}': {e}")
            raise e

    def delete_object(self, key: str) -> bool:
        """Delete a single object by key."""
        norm_key = _normalize_key(key)
        try:
            self.client.delete_object(Bucket=self.bucket, Key=norm_key)
            return True
        except ClientError as e:
            logger.error(f"Error deleting object '{norm_key}': {e}")
            raise e

    def delete_folder(self, prefix: str) -> int:
        """Recursively delete all objects under a folder prefix."""
        norm_prefix = _normalize_prefix(prefix)
        deleted_count = 0

        try:
            paginator = self.client.get_paginator("list_objects_v2")
            page_iterator = paginator.paginate(Bucket=self.bucket, Prefix=norm_prefix)

            for page in page_iterator:
                if "Contents" in page:
                    objects_to_delete = [{"Key": obj["Key"]} for obj in page["Contents"]]
                    if objects_to_delete:
                        delete_res = self.client.delete_objects(
                            Bucket=self.bucket, Delete={"Objects": objects_to_delete}
                        )
                        deleted_count += len(delete_res.get("Deleted", []))

        except ClientError as e:
            logger.error(f"Error deleting folder prefix '{norm_prefix}': {e}")
            raise e

        return deleted_count

    def generate_upload_url(
        self, key: str, content_type: str, expires_in: int = 900
    ) -> PresignedUploadData:
        """Generate a presigned PUT URL for direct browser upload."""
        norm_key = _normalize_key(key)
        try:
            upload_url = self.client.generate_presigned_url(
                ClientMethod="put_object",
                Params={
                    "Bucket": self.bucket,
                    "Key": norm_key,
                    "ContentType": content_type,
                },
                ExpiresIn=expires_in,
            )
            return PresignedUploadData(
                upload_url=upload_url,
                method="PUT",
                headers={"Content-Type": content_type},
                key=norm_key,
                expires_in=expires_in,
            )
        except ClientError as e:
            logger.error(f"Error generating presigned upload URL for key '{norm_key}': {e}")
            raise e

    def generate_download_url(
        self, key: str, expires_in: int = 3600, filename: Optional[str] = None
    ) -> PresignedDownloadData:
        """Generate a presigned GET URL for direct browser download."""
        norm_key = _normalize_key(key)
        params = {"Bucket": self.bucket, "Key": norm_key}
        if filename:
            params["ResponseContentDisposition"] = f'attachment; filename="{filename}"'

        try:
            download_url = self.client.generate_presigned_url(
                ClientMethod="get_object",
                Params=params,
                ExpiresIn=expires_in,
            )
            return PresignedDownloadData(
                download_url=download_url,
                key=norm_key,
                expires_in=expires_in,
            )
        except ClientError as e:
            logger.error(f"Error generating presigned download URL for key '{norm_key}': {e}")
            raise e
