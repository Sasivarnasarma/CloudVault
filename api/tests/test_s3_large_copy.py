"""Objects over the single-copy limit are copied in parts, inside storage."""

import pytest

from app.core import limits
from app.services.storage.exceptions import StorageError
from app.services.storage.s3 import S3StorageService
from tests.fake_s3 import FakeS3

BIG = bytes(range(256)) * 4  # 1024 bytes


@pytest.fixture(autouse=True)
def tiny_limits(monkeypatch):
    """Pretend a copy request holds 300 bytes, and copy in 400-byte parts."""
    monkeypatch.setattr(limits, "SINGLE_COPY_MAX_BYTES", 300)
    monkeypatch.setattr(limits, "COPY_PART_BYTES", 400)


@pytest.fixture
def s3():
    fake = FakeS3({"big.bin": BIG, "small.txt": b"hi", "dir/": b""})
    fake.copy_limit = 300
    return fake


@pytest.fixture
def service(s3):
    service = S3StorageService()
    service.client = s3
    return service


def test_a_big_file_is_copied_part_by_part_and_arrives_whole(service, s3):
    service.copy_object("big.bin", "copy.bin")

    assert s3.objects["copy.bin"] == BIG
    assert sorted(s3.part_copy_ranges) == ["bytes=0-399", "bytes=400-799", "bytes=800-1023"]
    assert s3.uploads == {}  # the upload was completed, not left open
    assert s3.objects["big.bin"] == BIG


def test_a_file_that_fits_still_uses_one_request(service, s3):
    service.copy_object("small.txt", "copy.txt")
    assert s3.objects["copy.txt"] == b"hi"
    assert s3.part_copy_ranges == []


def test_moving_a_big_file_removes_the_original_afterwards(service, s3):
    service.move_object("big.bin", "moved/big.bin")
    assert s3.objects["moved/big.bin"] == BIG
    assert "big.bin" not in s3.objects


def test_a_failed_part_aborts_the_upload_and_leaves_nothing(service, s3):
    s3.fail_part_copy = 2
    with pytest.raises(StorageError):
        service.copy_object("big.bin", "copy.bin")
    assert "copy.bin" not in s3.objects
    assert s3.uploads == {}


def test_moving_a_big_file_to_the_trash_and_back_works(service, s3):
    batch, failed = service.move_to_trash([("file", "big.bin")])
    assert failed == []
    assert "big.bin" not in s3.objects

    restored, failures = service.restore_from_trash(batch.id)
    assert failures == [] and restored == ["big.bin"]
    assert s3.objects["big.bin"] == BIG


def test_part_size_grows_to_stay_within_the_part_limit(monkeypatch):
    from app.services.storage.s3.copying import part_size_for

    monkeypatch.setattr(limits, "COPY_PART_BYTES", 256 * limits.MIB)
    assert part_size_for(6 * limits.GIB) == 256 * limits.MIB
    five_tib = 5 * limits.TIB
    assert part_size_for(five_tib) * limits.MAX_PARTS >= five_tib
    assert part_size_for(five_tib) % limits.MIB == 0
