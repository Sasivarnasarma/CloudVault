"""Presigned links are made for the address the browser uses, which may not be the API's own."""

from urllib.parse import urlparse

import pytest
from botocore.stub import Stubber

from app.core.config import settings
from app.services.storage.s3 import S3StorageService


@pytest.fixture
def public_endpoint(monkeypatch):
    monkeypatch.setattr(settings, "S3_ENDPOINT", "http://minio:9000")
    monkeypatch.setattr(settings, "S3_PUBLIC_ENDPOINT", "http://localhost:9000")


def host(url: str) -> str:
    return urlparse(url).netloc


def test_links_use_the_public_address_when_there_is_one(public_endpoint):
    service = S3StorageService()
    with Stubber(service.client) as stub:
        stub.add_client_error("head_object", "404", http_status_code=404)  # the key is free
        upload = service.generate_upload_url("docs/a.txt", "text/plain")
    download = service.generate_download_url("docs/a.txt")
    part = service.presign_upload_parts("big.bin", "upload-1", [1])[0][1]

    assert host(upload.upload_url) == "localhost:9000"
    assert host(download.download_url) == "localhost:9000"
    assert host(part) == "localhost:9000"


def test_the_api_itself_keeps_using_its_own_address(public_endpoint):
    service = S3StorageService()
    assert service.client.meta.endpoint_url == "http://minio:9000"
    assert service.signer.meta.endpoint_url == "http://localhost:9000"
    assert service.signer is not service.client


def test_without_a_public_address_one_client_does_both(monkeypatch):
    monkeypatch.setattr(settings, "S3_ENDPOINT", "http://storage.test:9000")
    monkeypatch.setattr(settings, "S3_PUBLIC_ENDPOINT", None)
    service = S3StorageService()
    assert service.signer is service.client
    assert host(service.generate_download_url("a.txt").download_url) == "storage.test:9000"


def test_an_empty_public_address_means_none(monkeypatch):
    from tests.test_config import make

    assert make(monkeypatch, S3_PUBLIC_ENDPOINT="").S3_PUBLIC_ENDPOINT is None
