import datetime as dt

import pytest
from botocore.exceptions import ClientError, EndpointConnectionError
from botocore.stub import Stubber

from app.services.storage.exceptions import (
    InvalidKeyError,
    ObjectExistsError,
    ObjectNotFoundError,
    StorageAccessError,
    StorageError,
    StorageUnavailableError,
)
from app.services.storage.s3 import S3StorageService, content_disposition

NOW = dt.datetime(2026, 1, 1, tzinfo=dt.timezone.utc)


@pytest.fixture
def service():
    return S3StorageService()


def client_error(code: str) -> ClientError:
    return ClientError({"Error": {"Code": code, "Message": "x"}}, "HeadObject")


class FailingClient:
    def __init__(self, exc: Exception):
        self.exc = exc

    def head_object(self, **_):
        raise self.exc


@pytest.mark.parametrize(
    ("exc", "expected"),
    [
        (client_error("404"), ObjectNotFoundError),
        (client_error("NoSuchKey"), ObjectNotFoundError),
        (client_error("AccessDenied"), StorageAccessError),
        (client_error("NoSuchBucket"), StorageUnavailableError),
        (client_error("InternalError"), StorageError),
        (EndpointConnectionError(endpoint_url="http://localhost:9000"), StorageUnavailableError),
    ],
)
def test_provider_errors_are_translated(service, exc, expected):
    service.client = FailingClient(exc)
    with pytest.raises(expected) as raised:
        service.get_object_metadata("a.txt")
    assert type(raised.value) is expected
    assert "localhost" not in raised.value.detail


def test_delete_folder_refuses_bucket_root(service):
    for prefix in ("", "/", "//"):
        with pytest.raises(InvalidKeyError):
            service.delete_folder(prefix)


def test_delete_folder_reports_partial_failures(service):
    with Stubber(service.client) as stub:
        stub.add_response(
            "list_objects_v2",
            {"Contents": [{"Key": "f/a"}, {"Key": "f/b"}], "KeyCount": 2},
            {"Bucket": "test-bucket", "Prefix": "f/"},
        )
        stub.add_response(
            "delete_objects",
            {"Deleted": [{"Key": "f/a"}], "Errors": [{"Key": "f/b", "Code": "AccessDenied"}]},
            {"Bucket": "test-bucket", "Delete": {"Objects": [{"Key": "f/a"}, {"Key": "f/b"}]}},
        )
        with pytest.raises(StorageError, match="1 could not be deleted"):
            service.delete_folder("f")


def test_delete_folder_counts_deleted(service):
    with Stubber(service.client) as stub:
        stub.add_response(
            "list_objects_v2",
            {"Contents": [{"Key": "f/a"}], "KeyCount": 1},
            {"Bucket": "test-bucket", "Prefix": "f/"},
        )
        stub.add_response(
            "delete_objects",
            {"Deleted": [{"Key": "f/a"}]},
            {"Bucket": "test-bucket", "Delete": {"Objects": [{"Key": "f/a"}]}},
        )
        assert service.delete_folder("f/") == 1


def test_upload_url_refuses_existing_key(service):
    with Stubber(service.client) as stub:
        stub.add_response("head_object", {}, {"Bucket": "test-bucket", "Key": "a.txt"})
        with pytest.raises(ObjectExistsError):
            service.generate_upload_url("a.txt", "text/plain")


def test_upload_url_for_new_key(service):
    with Stubber(service.client) as stub:
        stub.add_client_error("head_object", service_error_code="404", http_status_code=404)
        data = service.generate_upload_url("/dir//a.txt", "text/plain")
    assert data.key == "dir/a.txt"
    assert "dir/a.txt" in data.upload_url
    assert "X-Amz-Signature" in data.upload_url


def test_create_folder_conflicts_with_existing_prefix(service):
    with Stubber(service.client) as stub:
        stub.add_client_error("head_object", service_error_code="404", http_status_code=404)
        stub.add_response(
            "list_objects_v2",
            {"KeyCount": 1, "Contents": [{"Key": "docs/a"}]},
            {"Bucket": "test-bucket", "Prefix": "docs/", "MaxKeys": 1},
        )
        with pytest.raises(ObjectExistsError):
            service.create_folder("docs")


def test_list_objects_splits_folders_and_files(service):
    with Stubber(service.client) as stub:
        stub.add_response(
            "list_objects_v2",
            {
                "CommonPrefixes": [{"Prefix": "docs/sub/"}],
                "Contents": [
                    {"Key": "docs/", "Size": 0, "LastModified": NOW, "ETag": '"e"'},
                    {"Key": "docs/readme.md", "Size": 5, "LastModified": NOW, "ETag": '"abc"'},
                ],
            },
            {"Bucket": "test-bucket", "Prefix": "docs/", "Delimiter": "/"},
        )
        folders, objects = service.list_objects("docs")
    assert [f.name for f in folders] == ["sub"]
    assert [(o.name, o.content_type, o.etag) for o in objects] == [("readme.md", "text/markdown", "abc")]


def test_content_disposition_is_header_safe():
    header = content_disposition('a"b;\r\nc.txt')
    assert "\r" not in header and "\n" not in header
    assert header.startswith('attachment; filename="a_b___c.txt"')
    assert "filename*=UTF-8" in header
    assert "%C3%BC" in content_disposition("ü.txt")
    assert content_disposition("").startswith('attachment; filename="download"')
