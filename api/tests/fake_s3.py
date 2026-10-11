"""A small in-memory stand-in for the boto3 S3 client, for tests that move many objects around.

It implements only what the storage service calls. `fail_copy`, `fail_delete` and `undeletable`
make specific keys fail so error handling can be exercised.
"""

import io
from collections.abc import Iterator

from botocore.exceptions import ClientError


def _error(code: str, operation: str, status: int = 404) -> ClientError:
    return ClientError(
        {"Error": {"Code": code, "Message": code}, "ResponseMetadata": {"HTTPStatusCode": status}},
        operation,
    )


class _Paginator:
    def __init__(self, client: "FakeS3", operation: str) -> None:
        self._client = client
        self._operation = operation

    def paginate(self, **kwargs) -> Iterator[dict]:
        yield from self._client.pages(**kwargs)


class FakeS3:
    def __init__(self, objects: dict[str, bytes] | None = None, page_size: int = 2) -> None:
        self.objects: dict[str, bytes] = dict(objects or {})
        self.page_size = page_size
        self.fail_copy: set[str] = set()  # destination keys whose copy fails
        self.fail_delete: set[str] = set()  # keys that single deletes fail on
        self.undeletable: set[str] = set()  # keys that batch deletes report as errors
        self.copy_limit: int | None = None  # a single copy of a bigger object fails
        self.fail_part_copy: int | None = None  # this part number fails to copy
        self.uploads: dict[str, dict] = {}  # multipart uploads in progress, by upload id
        self.part_copy_ranges: list[str] = []

    # --- reading ---------------------------------------------------------------------

    def head_object(self, Bucket: str, Key: str) -> dict:
        if Key not in self.objects:
            raise _error("404", "HeadObject")
        return {"ContentLength": len(self.objects[Key]), "ContentType": "text/plain"}

    def get_object(self, Bucket: str, Key: str) -> dict:
        if Key not in self.objects:
            raise _error("NoSuchKey", "GetObject")
        return {"Body": io.BytesIO(self.objects[Key])}

    def _entries(self, prefix: str, delimiter: str | None) -> tuple[list[str], list[str]]:
        keys = sorted(k for k in self.objects if k.startswith(prefix))
        if not delimiter:
            return keys, []
        contents, prefixes = [], []
        for key in keys:
            rest = key[len(prefix) :]
            if delimiter in rest:
                common = prefix + rest.split(delimiter)[0] + delimiter
                if common not in prefixes:
                    prefixes.append(common)
            else:
                contents.append(key)
        return contents, prefixes

    def pages(
        self, Bucket: str, Prefix: str = "", Delimiter: str | None = None, **_
    ) -> Iterator[dict]:
        contents, prefixes = self._entries(Prefix, Delimiter)
        chunks = [contents[i : i + self.page_size] for i in range(0, len(contents), self.page_size)]
        for index, chunk in enumerate(chunks or [[]]):
            page: dict = {"Contents": [{"Key": k, "Size": len(self.objects[k])} for k in chunk]}
            if index == 0 and prefixes:
                page["CommonPrefixes"] = [{"Prefix": p} for p in prefixes]
            yield page

    def list_objects_v2(self, Bucket: str, Prefix: str = "", MaxKeys: int = 1000, **kwargs) -> dict:
        contents, prefixes = self._entries(Prefix, kwargs.get("Delimiter"))
        shown = contents[:MaxKeys]
        return {
            "KeyCount": len(shown) + len(prefixes),
            "Contents": [{"Key": k, "Size": len(self.objects[k])} for k in shown],
            "CommonPrefixes": [{"Prefix": p} for p in prefixes],
            "IsTruncated": False,
        }

    def get_paginator(self, operation: str) -> _Paginator:
        return _Paginator(self, operation)

    # --- writing ---------------------------------------------------------------------

    def put_object(self, Bucket: str, Key: str, Body: bytes = b"", **_) -> dict:
        self.objects[Key] = bytes(Body)
        return {}

    def copy_object(self, Bucket: str, Key: str, CopySource: dict) -> dict:
        if Key in self.fail_copy:
            raise _error("InternalError", "CopyObject", 500)
        source = CopySource["Key"]
        if source not in self.objects:
            raise _error("NoSuchKey", "CopyObject")
        if self.copy_limit is not None and len(self.objects[source]) > self.copy_limit:
            raise _error("EntityTooLarge", "CopyObject", 400)
        self.objects[Key] = self.objects[source]
        return {}

    def create_multipart_upload(self, Bucket: str, Key: str, **kwargs) -> dict:
        upload_id = f"up-{len(self.uploads) + 1}"
        self.uploads[upload_id] = {"key": Key, "parts": {}, "args": kwargs}
        return {"UploadId": upload_id}

    def upload_part_copy(
        self, Bucket: str, Key: str, UploadId: str, PartNumber: int, CopySource: dict, **kwargs
    ) -> dict:
        if PartNumber == self.fail_part_copy:
            raise _error("InternalError", "UploadPartCopy", 500)
        first, last = (int(n) for n in kwargs["CopySourceRange"].removeprefix("bytes=").split("-"))
        self.part_copy_ranges.append(kwargs["CopySourceRange"])
        self.uploads[UploadId]["parts"][PartNumber] = self.objects[CopySource["Key"]][
            first : last + 1
        ]
        return {"CopyPartResult": {"ETag": f'"part-{PartNumber}"'}}

    def complete_multipart_upload(
        self, Bucket: str, Key: str, UploadId: str, MultipartUpload: dict
    ) -> dict:
        upload = self.uploads.pop(UploadId)
        numbers = [p["PartNumber"] for p in MultipartUpload["Parts"]]
        assert numbers == sorted(numbers) and set(numbers) == set(upload["parts"])
        self.objects[Key] = b"".join(upload["parts"][n] for n in numbers)
        return {}

    def abort_multipart_upload(self, Bucket: str, Key: str, UploadId: str) -> dict:
        self.uploads.pop(UploadId, None)
        return {}

    def delete_object(self, Bucket: str, Key: str) -> dict:
        if Key in self.fail_delete:
            raise _error("AccessDenied", "DeleteObject", 403)
        self.objects.pop(Key, None)
        return {}

    def delete_objects(self, Bucket: str, Delete: dict) -> dict:
        deleted, errors = [], []
        for item in Delete["Objects"]:
            key = item["Key"]
            if key in self.undeletable:
                errors.append({"Key": key, "Code": "AccessDenied"})
            else:
                self.objects.pop(key, None)
                deleted.append({"Key": key})
        return {"Deleted": deleted, "Errors": errors}
