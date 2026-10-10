import datetime as dt

import pytest
from botocore.stub import Stubber

from app.services.storage.s3 import S3StorageService

NOW = dt.datetime(2026, 1, 1, tzinfo=dt.UTC)


@pytest.fixture
def service():
    return S3StorageService()


def test_list_objects_follows_pagination(service):
    with Stubber(service.client) as stub:
        stub.add_response(
            "list_objects_v2",
            {
                "IsTruncated": True,
                "NextContinuationToken": "tok",
                "Contents": [{"Key": "a.txt", "Size": 1, "LastModified": NOW, "ETag": '"1"'}],
            },
            {"Bucket": "test-bucket", "Prefix": "", "Delimiter": "/"},
        )
        stub.add_response(
            "list_objects_v2",
            {
                "IsTruncated": False,
                "CommonPrefixes": [{"Prefix": "z/"}],
                "Contents": [{"Key": "b.txt", "Size": 2, "LastModified": NOW, "ETag": '"2"'}],
            },
            {"Bucket": "test-bucket", "Prefix": "", "Delimiter": "/", "ContinuationToken": "tok"},
        )
        folders, objects = service.list_objects()
    assert [o.name for o in objects] == ["a.txt", "b.txt"]
    assert [f.name for f in folders] == ["z"]


def test_get_object_metadata_uses_storage_values(service):
    with Stubber(service.client) as stub:
        stub.add_response(
            "head_object",
            {
                "ContentLength": 7,
                "ContentType": "image/png",
                "LastModified": NOW,
                "ETag": '"abc"',
                "Metadata": {"k": "v"},
            },
            {"Bucket": "test-bucket", "Key": "img/a.png"},
        )
        meta = service.get_object_metadata("/img//a.png")
    assert (meta.key, meta.size, meta.content_type, meta.etag, meta.metadata) == (
        "img/a.png",
        7,
        "image/png",
        "abc",
        {"k": "v"},
    )


def test_download_url_signs_a_safe_content_disposition(service):
    data = service.generate_download_url("docs/a.txt", filename='bad"name.txt')
    assert "response-content-disposition" in data.download_url
    assert "bad%22name" not in data.download_url
