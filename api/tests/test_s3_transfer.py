import pytest
from botocore.stub import Stubber

from app.services.storage.exceptions import (
    InvalidKeyError,
    ObjectExistsError,
    ObjectNotFoundError,
    StorageError,
)
from app.services.storage.s3 import S3StorageService

BUCKET = "test-bucket"


@pytest.fixture
def service():
    return S3StorageService()


def head(stub, key, exists=True):
    if exists:
        stub.add_response("head_object", {}, {"Bucket": BUCKET, "Key": key})
    else:
        stub.add_client_error("head_object", service_error_code="404", http_status_code=404)


def copy(stub, source, destination):
    stub.add_response(
        "copy_object",
        {},
        {"Bucket": BUCKET, "Key": destination, "CopySource": {"Bucket": BUCKET, "Key": source}},
    )


def listing(stub, prefix, keys, **extra):
    contents = [{"Key": k} for k in keys]
    stub.add_response(
        "list_objects_v2",
        {"Contents": contents, "KeyCount": len(keys)} if keys else {"KeyCount": 0},
        {"Bucket": BUCKET, "Prefix": prefix, **extra},
    )


def delete_batch(stub, keys, errors=None):
    response = {"Deleted": [{"Key": k} for k in keys if k not in (errors or [])]}
    if errors:
        response["Errors"] = [{"Key": k, "Code": "AccessDenied"} for k in errors]
    stub.add_response(
        "delete_objects", response, {"Bucket": BUCKET, "Delete": {"Objects": [{"Key": k} for k in keys]}}
    )


class TestObjects:
    def test_copy_object(self, service):
        with Stubber(service.client) as stub:
            head(stub, "a/x.txt")
            head(stub, "b/x.txt", exists=False)
            copy(stub, "a/x.txt", "b/x.txt")
            assert service.copy_object("/a/x.txt", "b//x.txt") == "b/x.txt"
            stub.assert_no_pending_responses()

    def test_copy_refuses_existing_destination(self, service):
        with Stubber(service.client) as stub:
            head(stub, "a.txt")
            head(stub, "b.txt")
            with pytest.raises(ObjectExistsError):
                service.copy_object("a.txt", "b.txt")

    def test_copy_with_overwrite_skips_the_destination_check(self, service):
        with Stubber(service.client) as stub:
            head(stub, "a.txt")
            copy(stub, "a.txt", "b.txt")
            service.copy_object("a.txt", "b.txt", allow_overwrite=True)
            stub.assert_no_pending_responses()

    def test_copy_missing_source(self, service):
        with Stubber(service.client) as stub:
            head(stub, "a.txt", exists=False)
            with pytest.raises(ObjectNotFoundError):
                service.copy_object("a.txt", "b.txt")

    def test_copy_to_same_key_is_rejected_before_any_request(self, service):
        with pytest.raises(InvalidKeyError):
            service.copy_object("a.txt", "/a.txt")

    def test_move_copies_then_deletes_the_original(self, service):
        with Stubber(service.client) as stub:
            head(stub, "a.txt")
            head(stub, "new.txt", exists=False)
            copy(stub, "a.txt", "new.txt")
            stub.add_response("delete_object", {}, {"Bucket": BUCKET, "Key": "a.txt"})
            assert service.move_object("a.txt", "new.txt") == "new.txt"
            stub.assert_no_pending_responses()

    def test_move_reports_when_the_original_cannot_be_removed(self, service):
        with Stubber(service.client) as stub:
            head(stub, "a.txt")
            head(stub, "new.txt", exists=False)
            copy(stub, "a.txt", "new.txt")
            stub.add_client_error("delete_object", service_error_code="AccessDenied", http_status_code=403)
            with pytest.raises(StorageError, match="could not be removed"):
                service.move_object("a.txt", "new.txt")


class TestFolders:
    @pytest.mark.parametrize(
        ("source", "destination"),
        [("a", "a/"), ("a", "a/b"), ("a/b", "a/b/c/d"), ("/", "x"), ("x", "/"), ("x", "../y")],
    )
    def test_invalid_pairs_are_rejected(self, service, source, destination):
        with pytest.raises(InvalidKeyError):
            service.copy_folder(source, destination)
        with pytest.raises(InvalidKeyError):
            service.move_folder(source, destination)

    def test_sibling_with_shared_name_prefix_is_not_treated_as_inside(self, service):
        with Stubber(service.client) as stub:
            listing(stub, "docs/", ["docs/a.txt"])
            listing(stub, "docs2/", [], MaxKeys=1)
            copy(stub, "docs/a.txt", "docs2/a.txt")
            assert service.copy_folder("docs", "docs2") == 1

    def test_copy_folder_maps_every_key_including_markers(self, service):
        with Stubber(service.client) as stub:
            listing(stub, "src/", ["src/", "src/a.txt", "src/sub/b.txt"])
            listing(stub, "dst/", [], MaxKeys=1)
            copy(stub, "src/", "dst/")
            copy(stub, "src/a.txt", "dst/a.txt")
            copy(stub, "src/sub/b.txt", "dst/sub/b.txt")
            assert service.copy_folder("/src", "dst/") == 3
            stub.assert_no_pending_responses()

    def test_copy_folder_refuses_an_existing_destination(self, service):
        with Stubber(service.client) as stub:
            listing(stub, "src/", ["src/a.txt"])
            listing(stub, "dst/", ["dst/old.txt"], MaxKeys=1)
            with pytest.raises(ObjectExistsError):
                service.copy_folder("src", "dst")

    def test_copy_missing_folder(self, service):
        with Stubber(service.client) as stub:
            listing(stub, "src/", [])
            with pytest.raises(ObjectNotFoundError):
                service.copy_folder("src", "dst")

    def test_failed_copy_rolls_back_what_was_already_copied(self, service):
        with Stubber(service.client) as stub:
            listing(stub, "src/", ["src/a.txt", "src/b.txt"])
            listing(stub, "dst/", [], MaxKeys=1)
            copy(stub, "src/a.txt", "dst/a.txt")
            stub.add_client_error("copy_object", service_error_code="InternalError", http_status_code=500)
            delete_batch(stub, ["dst/a.txt"])
            with pytest.raises(StorageError):
                service.copy_folder("src", "dst")
            stub.assert_no_pending_responses()

    def test_move_folder_removes_all_originals_after_copying(self, service):
        with Stubber(service.client) as stub:
            listing(stub, "src/", ["src/a.txt", "src/b.txt"])
            listing(stub, "dst/", [], MaxKeys=1)
            copy(stub, "src/a.txt", "dst/a.txt")
            copy(stub, "src/b.txt", "dst/b.txt")
            delete_batch(stub, ["src/a.txt", "src/b.txt"])
            assert service.move_folder("src", "dst") == 2
            stub.assert_no_pending_responses()

    def test_move_folder_reports_originals_that_could_not_be_removed(self, service):
        with Stubber(service.client) as stub:
            listing(stub, "src/", ["src/a.txt", "src/b.txt"])
            listing(stub, "dst/", [], MaxKeys=1)
            copy(stub, "src/a.txt", "dst/a.txt")
            copy(stub, "src/b.txt", "dst/b.txt")
            delete_batch(stub, ["src/a.txt", "src/b.txt"], errors=["src/b.txt"])
            with pytest.raises(StorageError, match="1 original items could not be removed"):
                service.move_folder("src", "dst")
