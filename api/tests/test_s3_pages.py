import datetime as dt

import pytest
from botocore.stub import Stubber

from app.services.storage.exceptions import InvalidKeyError
from app.services.storage.s3 import S3StorageService

NOW = dt.datetime(2026, 1, 1, tzinfo=dt.timezone.utc)


@pytest.fixture
def service():
    return S3StorageService()


def test_first_page_returns_a_cursor_when_truncated(service):
    with Stubber(service.client) as stub:
        stub.add_response(
            "list_objects_v2",
            {
                "IsTruncated": True,
                "NextContinuationToken": "tok-1",
                "CommonPrefixes": [{"Prefix": "docs/sub/"}],
                "Contents": [
                    {"Key": "docs/", "Size": 0, "LastModified": NOW, "ETag": '"m"'},
                    {"Key": "docs/a.txt", "Size": 3, "LastModified": NOW, "ETag": '"a"'},
                ],
            },
            {"Bucket": "test-bucket", "Prefix": "docs/", "Delimiter": "/", "MaxKeys": 2},
        )
        folders, objects, cursor = service.list_page("docs", limit=2)
    assert [f.name for f in folders] == ["sub"]
    assert [o.name for o in objects] == ["a.txt"]  # the folder marker is skipped
    assert cursor == "tok-1"


def test_next_page_passes_the_cursor_and_ends_without_one(service):
    with Stubber(service.client) as stub:
        stub.add_response(
            "list_objects_v2",
            {"IsTruncated": False, "Contents": [{"Key": "b.txt", "Size": 1, "LastModified": NOW, "ETag": '"b"'}]},
            {"Bucket": "test-bucket", "Prefix": "", "Delimiter": "/", "MaxKeys": 100, "ContinuationToken": "tok-1"},
        )
        folders, objects, cursor = service.list_page("", limit=100, cursor="tok-1")
    assert folders == [] and [o.name for o in objects] == ["b.txt"]
    assert cursor is None


@pytest.mark.parametrize("code", ["InvalidArgument", "InvalidContinuation", "SomethingNew"])
def test_a_bad_cursor_is_a_client_error_not_a_storage_failure(service, code):
    with Stubber(service.client) as stub:
        stub.add_client_error("list_objects_v2", service_error_code=code, http_status_code=400)
        with pytest.raises(InvalidKeyError, match="cursor"):
            service.list_page("", limit=10, cursor="garbage")


def test_a_server_error_with_a_cursor_is_still_a_storage_failure(service):
    from app.services.storage.exceptions import StorageError

    with Stubber(service.client) as stub:
        stub.add_client_error("list_objects_v2", service_error_code="InternalError", http_status_code=500)
        with pytest.raises(StorageError) as raised:
            service.list_page("", limit=10, cursor="tok")
    assert not isinstance(raised.value, InvalidKeyError)


def test_prefix_is_validated_for_pages(service):
    with pytest.raises(InvalidKeyError):
        service.list_page("a/../b", limit=10)
