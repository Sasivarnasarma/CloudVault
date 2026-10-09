import pytest
from botocore.stub import Stubber

from app.core.limits import DEFAULT_PART_BYTES
from app.services.storage.exceptions import (
    InvalidKeyError,
    ObjectExistsError,
    ObjectNotFoundError,
    UploadIncompleteError,
)
from app.services.storage.s3 import S3StorageService

BUCKET = "test-bucket"


@pytest.fixture
def service():
    return S3StorageService()


def parts_response(*numbers, size=DEFAULT_PART_BYTES):
    return {"Parts": [{"PartNumber": n, "ETag": f'"etag{n}"', "Size": size} for n in numbers]}


class TestCreate:
    def test_starts_an_upload_and_plans_the_parts(self, service):
        with Stubber(service.client) as stub:
            stub.add_client_error("head_object", service_error_code="404", http_status_code=404)
            stub.add_response(
                "create_multipart_upload",
                {"UploadId": "u-1"},
                {"Bucket": BUCKET, "Key": "big/file.bin", "ContentType": "application/zip"},
            )
            info = service.create_multipart_upload("/big//file.bin", "application/zip", 70 * 1024**2)
        assert info.upload_id == "u-1"
        assert info.part_size == DEFAULT_PART_BYTES
        assert info.part_count == 3  # 70 MiB in 32 MiB parts

    def test_refuses_an_existing_key_unless_overwriting(self, service):
        with Stubber(service.client) as stub:
            stub.add_response("head_object", {}, {"Bucket": BUCKET, "Key": "a.bin"})
            with pytest.raises(ObjectExistsError):
                service.create_multipart_upload("a.bin", "application/octet-stream", 100)

        with Stubber(service.client) as stub:
            stub.add_response(
                "create_multipart_upload",
                {"UploadId": "u-2"},
                {"Bucket": BUCKET, "Key": "a.bin", "ContentType": "application/octet-stream"},
            )
            assert service.create_multipart_upload("a.bin", "application/octet-stream", 100, True).upload_id == "u-2"

    def test_invalid_keys_are_rejected_before_any_request(self, service):
        with pytest.raises(InvalidKeyError):
            service.create_multipart_upload("../x", "text/plain", 10)


class TestPartUrls:
    def test_presigns_each_requested_part(self, service):
        urls = service.presign_upload_parts("big.bin", "u-1", [1, 7])
        assert [n for n, _ in urls] == [1, 7]
        assert "partNumber=7" in urls[1][1] and "uploadId=u-1" in urls[1][1]
        assert "X-Amz-Signature" in urls[0][1]

    @pytest.mark.parametrize("numbers", [[0], [10_001], [-1]])
    def test_rejects_out_of_range_part_numbers(self, service, numbers):
        with pytest.raises(InvalidKeyError):
            service.presign_upload_parts("big.bin", "u-1", numbers)


class TestListAndComplete:
    def test_lists_parts_in_order_across_pages(self, service):
        with Stubber(service.client) as stub:
            stub.add_response(
                "list_parts",
                {**parts_response(2), "IsTruncated": True, "NextPartNumberMarker": 2},
                {"Bucket": BUCKET, "Key": "big.bin", "UploadId": "u-1"},
            )
            stub.add_response(
                "list_parts",
                {**parts_response(1), "IsTruncated": False},
                {"Bucket": BUCKET, "Key": "big.bin", "UploadId": "u-1", "PartNumberMarker": 2},
            )
            parts = service.list_uploaded_parts("big.bin", "u-1")
        assert [p.part_number for p in parts] == [1, 2]

    def test_complete_uses_etags_from_storage(self, service):
        with Stubber(service.client) as stub:
            stub.add_response("list_parts", parts_response(1, 2), {"Bucket": BUCKET, "Key": "big.bin", "UploadId": "u-1"})
            stub.add_response(
                "complete_multipart_upload",
                {"ETag": '"final-2"'},
                {
                    "Bucket": BUCKET,
                    "Key": "big.bin",
                    "UploadId": "u-1",
                    "MultipartUpload": {"Parts": [{"ETag": '"etag1"', "PartNumber": 1}, {"ETag": '"etag2"', "PartNumber": 2}]},
                },
            )
            assert service.complete_multipart_upload("big.bin", "u-1", 2) == "final-2"
            stub.assert_no_pending_responses()

    def test_complete_names_the_missing_parts_without_calling_storage_to_finish(self, service):
        with Stubber(service.client) as stub:
            stub.add_response("list_parts", parts_response(1, 3), {"Bucket": BUCKET, "Key": "big.bin", "UploadId": "u-1"})
            with pytest.raises(UploadIncompleteError, match=r"1 part\(s\) are missing \(e.g. 2\)"):
                service.complete_multipart_upload("big.bin", "u-1", 3)
            stub.assert_no_pending_responses()

    def test_unknown_uploads_are_not_found(self, service):
        with Stubber(service.client) as stub:
            stub.add_client_error("list_parts", service_error_code="NoSuchUpload", http_status_code=404)
            with pytest.raises(ObjectNotFoundError, match="upload was not found"):
                service.list_uploaded_parts("big.bin", "gone")

    def test_storage_rejecting_a_part_is_reported_as_incomplete(self, service):
        with Stubber(service.client) as stub:
            stub.add_response("list_parts", parts_response(1), {"Bucket": BUCKET, "Key": "big.bin", "UploadId": "u-1"})
            stub.add_client_error("complete_multipart_upload", service_error_code="InvalidPart", http_status_code=400)
            with pytest.raises(UploadIncompleteError):
                service.complete_multipart_upload("big.bin", "u-1", 1)


def test_abort_discards_the_upload(service):
    with Stubber(service.client) as stub:
        stub.add_response("abort_multipart_upload", {}, {"Bucket": BUCKET, "Key": "big.bin", "UploadId": "u-1"})
        service.abort_multipart_upload("/big.bin", "u-1")
        stub.assert_no_pending_responses()
