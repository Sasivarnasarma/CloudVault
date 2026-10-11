"""Creating the bucket at startup, for a fresh local storage."""

import pytest
from botocore.stub import Stubber
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.services.storage.s3 import S3StorageService


@pytest.fixture
def service():
    return S3StorageService()


def test_leaves_a_bucket_that_exists_alone(service):
    with Stubber(service.client) as stub:
        stub.add_response("head_bucket", {}, {"Bucket": "test-bucket"})
        assert service.ensure_bucket() is False
        stub.assert_no_pending_responses()


def test_creates_a_bucket_that_is_missing(service, monkeypatch):
    monkeypatch.setattr(settings, "S3_REGION", "us-east-1")
    with Stubber(service.client) as stub:
        stub.add_client_error("head_bucket", "404", http_status_code=404)
        stub.add_response("create_bucket", {}, {"Bucket": "test-bucket"})
        assert service.ensure_bucket() is True
        stub.assert_no_pending_responses()


def test_names_the_region_for_regions_that_need_it(service, monkeypatch):
    monkeypatch.setattr(settings, "S3_REGION", "eu-west-1")
    with Stubber(service.client) as stub:
        stub.add_client_error("head_bucket", "404", http_status_code=404)
        stub.add_response(
            "create_bucket",
            {},
            {
                "Bucket": "test-bucket",
                "CreateBucketConfiguration": {"LocationConstraint": "eu-west-1"},
            },
        )
        assert service.ensure_bucket() is True


def test_does_not_hide_other_errors_such_as_no_access(service):
    from botocore.exceptions import ClientError

    with Stubber(service.client) as stub:
        stub.add_client_error("head_bucket", "403", http_status_code=403)
        with pytest.raises(ClientError):
            service.ensure_bucket()


class FakeStorageForStartup:
    def __init__(self, fail=False):
        self.calls = 0
        self.fail = fail

    def ensure_bucket(self):
        self.calls += 1
        if self.fail:
            raise RuntimeError("storage is down")
        return True


@pytest.fixture
def fake(monkeypatch):
    fake = FakeStorageForStartup()
    monkeypatch.setattr("app.main.get_storage_service", lambda: fake)
    return fake


def test_the_app_creates_the_bucket_at_startup_only_when_asked(fake, monkeypatch):
    monkeypatch.setattr(settings, "S3_CREATE_BUCKET", False)
    with TestClient(app):
        pass
    assert fake.calls == 0

    monkeypatch.setattr(settings, "S3_CREATE_BUCKET", True)
    with TestClient(app):
        pass
    assert fake.calls == 1


def test_the_app_still_starts_when_the_bucket_cannot_be_created(fake, monkeypatch):
    fake.fail = True
    monkeypatch.setattr(settings, "S3_CREATE_BUCKET", True)
    with TestClient(app) as client:
        assert client.get("/").status_code in (200, 404)
    assert fake.calls == 1
