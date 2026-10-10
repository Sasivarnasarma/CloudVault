import datetime as dt

import pytest
from botocore.stub import Stubber

from app.services.storage.exceptions import InvalidKeyError, PayloadTooLargeError
from app.services.storage.s3 import S3StorageService

NOW = dt.datetime(2026, 1, 1, tzinfo=dt.UTC)


@pytest.fixture
def service():
    return S3StorageService()


def obj(key, size=1):
    return {"Key": key, "Size": size, "LastModified": NOW, "ETag": '"e"'}


def listing(stub, prefix, contents, token=None, next_token=None):
    response = {"IsTruncated": next_token is not None, "Contents": contents}
    if next_token:
        response["NextContinuationToken"] = next_token
    expected = {"Bucket": "test-bucket", "Prefix": prefix}
    if token:
        expected["ContinuationToken"] = token
    stub.add_response("list_objects_v2", response, expected)


def test_lists_every_file_under_a_folder_with_its_size(service):
    with Stubber(service.client) as stub:
        listing(
            stub,
            "photos/",
            [obj("photos/a.jpg", 10), obj("photos/2024/b.jpg", 20), obj("photos/2024/c.jpg", 30)],
        )
        files, empty = service.list_folder_tree("photos", max_files=100)
    assert [(f.key, f.size) for f in files] == [
        ("photos/a.jpg", 10),
        ("photos/2024/b.jpg", 20),
        ("photos/2024/c.jpg", 30),
    ]
    assert empty == []


def test_follows_pagination(service):
    with Stubber(service.client) as stub:
        listing(stub, "d/", [obj("d/a")], next_token="t1")
        listing(stub, "d/", [obj("d/b")], token="t1")
        files, _ = service.list_folder_tree("d/", max_files=10)
    assert [f.key for f in files] == ["d/a", "d/b"]


def test_folder_markers_are_not_files_and_only_empty_folders_are_reported(service):
    with Stubber(service.client) as stub:
        listing(
            stub,
            "d/",
            [
                obj("d/", 0),  # the folder's own marker
                obj("d/empty/", 0),  # nothing inside
                obj("d/full/", 0),  # has a file inside
                obj("d/full/x.txt", 5),
                obj("d/last/", 0),  # empty, and the final key
            ],
        )
        files, empty = service.list_folder_tree("d/", max_files=10)
    assert [f.key for f in files] == ["d/full/x.txt"]
    assert empty == ["d/empty/", "d/last/"]


def test_an_empty_marker_before_a_page_break_is_still_found(service):
    with Stubber(service.client) as stub:
        listing(stub, "d/", [obj("d/empty/", 0)], next_token="t1")
        listing(stub, "d/", [obj("d/z.txt", 1)], token="t1")
        files, empty = service.list_folder_tree("d/", max_files=10)
    assert [f.key for f in files] == ["d/z.txt"]
    assert empty == ["d/empty/"]


def test_refuses_folders_with_too_many_files(service):
    with Stubber(service.client) as stub:
        listing(stub, "d/", [obj(f"d/{i}") for i in range(4)])
        with pytest.raises(PayloadTooLargeError, match="more than 3 files"):
            service.list_folder_tree("d/", max_files=3)


def test_allows_exactly_the_limit(service):
    with Stubber(service.client) as stub:
        listing(stub, "d/", [obj(f"d/{i}") for i in range(3)])
        files, _ = service.list_folder_tree("d/", max_files=3)
    assert len(files) == 3


@pytest.mark.parametrize("prefix", ["", "/", "..", "a/../b"])
def test_rejects_the_bucket_root_and_traversal(service, prefix):
    with pytest.raises(InvalidKeyError):
        service.list_folder_tree(prefix, max_files=10)
