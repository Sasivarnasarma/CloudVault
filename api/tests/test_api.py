from typing import List, Optional, Tuple

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.schemas.storage import (
    FolderItem,
    ObjectMetadata,
    PresignedDownloadData,
    PresignedUploadData,
)
from app.services.storage.base import BaseStorageService
from app.services.storage.exceptions import (
    ObjectExistsError,
    ObjectNotFoundError,
    StorageAccessError,
    StorageError,
    StorageUnavailableError,
)
from app.services.storage.factory import get_storage_service
from app.services.storage.keys import normalize_folder, normalize_key


class FakeStorage(BaseStorageService):
    def __init__(self) -> None:
        self.calls: List[Tuple[str, str]] = []
        self.existing = {"exists.txt"}
        self.existing_folders = {"taken/"}
        self.connected = True
        self.fail_with: Optional[Exception] = None

    def check_connection(self) -> bool:
        return self.connected

    def list_objects(self, prefix: str = "", delimiter: str = "/"):
        self.calls.append(("list", prefix))
        if self.fail_with:
            raise self.fail_with
        return [FolderItem(name="sub", prefix=prefix + "sub/")], []

    def get_object_metadata(self, key: str) -> ObjectMetadata:
        if key not in self.existing:
            raise ObjectNotFoundError()
        return ObjectMetadata(
            key=key,
            name=key,
            size=1,
            content_type="text/plain",
            last_modified="2026-01-01T00:00:00Z",
            etag="e",
        )

    def create_folder(self, folder_path: str) -> FolderItem:
        self.calls.append(("create_folder", folder_path))
        if normalize_folder(folder_path) in self.existing_folders:
            raise ObjectExistsError("A folder with this name already exists")
        return FolderItem(name="f", prefix=normalize_folder(folder_path))

    def delete_object(self, key: str) -> bool:
        self.calls.append(("delete_object", key))
        return True

    def delete_folder(self, prefix: str) -> int:
        self.calls.append(("delete_folder", prefix))
        return 3

    def generate_upload_url(self, key, content_type, expires_in=900, allow_overwrite=False):
        if key in self.existing:
            raise ObjectExistsError("A file with this name already exists")
        return PresignedUploadData(
            upload_url="https://example.test/put",
            headers={"Content-Type": content_type},
            key=normalize_key(key),
            expires_in=expires_in,
        )

    def generate_download_url(self, key, expires_in=3600, filename: Optional[str] = None):
        return PresignedDownloadData(download_url="https://example.test/get", key=key, expires_in=expires_in)


@pytest.fixture
def storage():
    fake = FakeStorage()
    app.dependency_overrides[get_storage_service] = lambda: fake
    yield fake
    app.dependency_overrides.clear()


@pytest.fixture
def client(storage):
    return TestClient(app)


@pytest.mark.parametrize("prefix", ["/", "//", "..", "a/.."])
def test_delete_folder_rejects_bucket_root_and_traversal(client, storage, prefix):
    res = client.delete("/api/folders", params={"prefix": prefix})
    assert res.status_code == 400
    assert not any(name == "delete_folder" for name, _ in storage.calls)


def test_delete_folder_normalizes_prefix(client, storage):
    res = client.delete("/api/folders", params={"prefix": "/docs//old"})
    assert res.status_code == 200
    assert res.json() == {"success": True, "prefix": "docs/old/", "deleted_count": 3}
    assert ("delete_folder", "docs/old/") in storage.calls


@pytest.mark.parametrize("key", ["/", "", "a/", "../x", "a\\b"])
def test_object_routes_reject_invalid_keys(client, key):
    assert client.delete("/api/objects", params={"key": key}).status_code == 400
    assert client.get("/api/objects/metadata", params={"key": key}).status_code == 400
    assert client.post("/api/objects/presign-upload", json={"key": key}).status_code == 400


def test_create_folder_rejects_root(client):
    assert client.post("/api/folders", json={"path": "/"}).status_code == 400
    assert client.post("/api/folders", json={"path": "docs"}).status_code == 200


def test_create_existing_folder_is_409(client):
    res = client.post("/api/folders", json={"path": "taken"})
    assert res.status_code == 409
    assert res.json() == {"detail": "A folder with this name already exists"}


def test_list_normalizes_prefix(client, storage):
    res = client.get("/api/objects", params={"prefix": "/docs"})
    assert res.status_code == 200
    assert res.json()["prefix"] == "docs/"
    assert ("list", "docs/") in storage.calls


def test_list_response_totals(client):
    body = client.get("/api/objects").json()
    assert body["total_count"] == 1 and body["total_size"] == 0
    assert body["folders"] == [{"name": "sub", "prefix": "sub/"}]


def test_presign_upload_conflict_and_validation(client):
    assert client.post("/api/objects/presign-upload", json={"key": "exists.txt"}).status_code == 409
    ok = client.post("/api/objects/presign-upload", json={"key": "new.txt", "content_type": "text/plain"})
    assert ok.status_code == 200 and ok.json()["method"] == "PUT"
    bad_type = client.post("/api/objects/presign-upload", json={"key": "n.txt", "content_type": "bad\r\ntype"})
    assert bad_type.status_code == 422
    too_big = client.post("/api/objects/presign-upload", json={"key": "n.txt", "size": 10**13})
    assert too_big.status_code == 413


def test_presign_upload_defaults_content_type(client):
    res = client.post("/api/objects/presign-upload", json={"key": "new.bin"})
    assert res.status_code == 200
    assert res.json()["headers"] == {"Content-Type": "application/octet-stream"}


def test_presign_download_missing_object_is_404(client):
    assert client.get("/api/objects/presign-download", params={"key": "nope.txt"}).status_code == 404
    assert client.get("/api/objects/presign-download", params={"key": "exists.txt"}).status_code == 200


def test_presign_download_returns_url(client):
    res = client.get("/api/objects/presign-download", params={"key": "exists.txt", "filename": "x.txt"})
    assert res.status_code == 200
    assert res.json()["download_url"].startswith("https://")


def test_metadata_success_shape(client):
    res = client.get("/api/objects/metadata", params={"key": "/exists.txt"})
    assert res.status_code == 200
    body = res.json()
    assert body["key"] == "exists.txt" and body["content_type"] == "text/plain"
    assert client.get("/api/objects/metadata", params={"key": "missing.txt"}).status_code == 404


def test_delete_object_success_normalizes_key(client, storage):
    res = client.delete("/api/objects", params={"key": "/a//b.txt"})
    assert res.status_code == 200
    body = res.json()
    assert body["success"] is True and body["key"] == "a/b.txt"
    assert ("delete_object", "a/b.txt") in storage.calls


@pytest.mark.parametrize(
    ("error", "status"),
    [
        (StorageUnavailableError(), 503),
        (StorageAccessError(), 502),
        (StorageError(), 502),
        (ObjectNotFoundError(), 404),
    ],
)
def test_storage_errors_map_to_http_statuses(client, storage, error, status):
    storage.fail_with = error
    res = client.get("/api/objects")
    assert res.status_code == status
    assert res.json() == {"detail": error.detail}


def test_error_responses_do_not_leak_secrets(client, storage):
    storage.fail_with = StorageError("Storage failed while listing objects")
    body = client.get("/api/objects").text
    assert "Traceback" not in body and settings.S3_SECRET_KEY not in body


def test_health_reports_connection(client):
    body = client.get("/api/health").json()
    assert body["status"] == "ok" and body["storage_connected"] is True


def test_health_reports_degraded_when_storage_is_down(client, storage):
    storage.connected = False
    res = client.get("/api/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "degraded" and body["storage_connected"] is False


def test_health_never_exposes_credentials(client):
    text = client.get("/api/health").text
    assert settings.S3_SECRET_KEY not in text and settings.S3_ACCESS_KEY not in text


def test_cors_allows_configured_origin_only(client):
    origin = settings.CORS_ORIGINS[0]
    allowed = client.options(
        "/api/objects", headers={"Origin": origin, "Access-Control-Request-Method": "DELETE"}
    )
    assert allowed.headers.get("access-control-allow-origin") == origin

    blocked = client.options(
        "/api/objects",
        headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "DELETE"},
    )
    assert "access-control-allow-origin" not in blocked.headers
