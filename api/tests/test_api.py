import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.schemas.storage import (
    FolderItem,
    MultipartUploadInfo,
    ObjectMetadata,
    PresignedDownloadData,
    PresignedUploadData,
    TreeFile,
    UploadedPartInfo,
)
from app.services.storage.base import BaseStorageService
from app.services.storage.exceptions import (
    ObjectExistsError,
    ObjectNotFoundError,
    PayloadTooLargeError,
    StorageAccessError,
    StorageError,
    StorageUnavailableError,
    UploadIncompleteError,
)
from app.services.storage.factory import get_storage_service
from app.services.storage.keys import normalize_folder, normalize_key


class FakeStorage(BaseStorageService):
    def __init__(self) -> None:
        self.calls: list[tuple[str, str]] = []
        self.existing = {"exists.txt"}
        self.existing_folders = {"taken/"}
        self.connected = True
        self.fail_with: Exception | None = None

    def check_connection(self) -> bool:
        return self.connected

    def list_objects(self, prefix: str = "", delimiter: str = "/"):
        self.calls.append(("list", prefix))
        if self.fail_with:
            raise self.fail_with
        return [FolderItem(name="sub", prefix=prefix + "sub/")], []

    def list_page(self, prefix: str = "", limit: int = 500, cursor: str | None = None):
        self.calls.append(("list_page", f"{prefix}|{limit}|{cursor}"))
        if self.fail_with:
            raise self.fail_with
        start = int(cursor or 0)
        names = [f"f{i:03}.txt" for i in range(5)]
        chunk = names[start : start + limit]
        objects = [
            ObjectMetadata(
                key=prefix + n,
                name=n,
                size=10,
                content_type="text/plain",
                last_modified="2026-01-01T00:00:00Z",
                etag="e",
            )
            for n in chunk
        ]
        more = start + limit < len(names)
        return [], objects, str(start + limit) if more else None

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

    def copy_object(self, source_key, destination_key, allow_overwrite=False):
        self.calls.append(("copy_object", f"{source_key}->{destination_key}:{allow_overwrite}"))
        if source_key not in self.existing:
            raise ObjectNotFoundError()
        if destination_key in self.existing and not allow_overwrite:
            raise ObjectExistsError("A file with this name already exists")
        return destination_key

    def move_object(self, source_key, destination_key, allow_overwrite=False):
        self.calls.append(("move_object", f"{source_key}->{destination_key}:{allow_overwrite}"))
        return self.copy_object(source_key, destination_key, allow_overwrite)

    def copy_folder(self, source_prefix, destination_prefix):
        self.calls.append(("copy_folder", f"{source_prefix}->{destination_prefix}"))
        if destination_prefix in self.existing_folders:
            raise ObjectExistsError("A folder with this name already exists")
        return 5

    def move_folder(self, source_prefix, destination_prefix):
        self.calls.append(("move_folder", f"{source_prefix}->{destination_prefix}"))
        return self.copy_folder(source_prefix, destination_prefix)

    def create_multipart_upload(self, key, content_type, size, allow_overwrite=False):
        self.calls.append(("mp_create", f"{key}|{content_type}|{size}|{allow_overwrite}"))
        if key in self.existing and not allow_overwrite:
            raise ObjectExistsError("A file with this name already exists")
        return MultipartUploadInfo(upload_id="up-1", part_size=32 * 1024**2, part_count=3)

    def presign_upload_parts(self, key, upload_id, part_numbers, expires_in=3600):
        self.calls.append(("mp_presign", f"{key}|{upload_id}|{part_numbers}"))
        return [(n, f"https://example.test/part/{n}") for n in part_numbers]

    def list_uploaded_parts(self, key, upload_id):
        self.calls.append(("mp_list", f"{key}|{upload_id}"))
        if upload_id == "gone":
            raise ObjectNotFoundError("The upload was not found")
        return [UploadedPartInfo(part_number=1, size=32 * 1024**2, etag="e1")]

    def complete_multipart_upload(self, key, upload_id, part_count):
        self.calls.append(("mp_complete", f"{key}|{upload_id}|{part_count}"))
        if part_count != 3:
            raise UploadIncompleteError("1 part(s) are missing (e.g. 3)")
        return "etag-final"

    def abort_multipart_upload(self, key, upload_id):
        self.calls.append(("mp_abort", f"{key}|{upload_id}"))

    def list_folder_tree(self, prefix, max_files):
        self.calls.append(("tree", f"{prefix}|{max_files}"))
        if self.fail_with:
            raise self.fail_with
        return [TreeFile(key=prefix + "a.txt", size=3), TreeFile(key=prefix + "x/b.txt", size=4)], [
            prefix + "empty/"
        ]

    def generate_upload_url(self, key, content_type, expires_in=900, allow_overwrite=False):
        self.calls.append(("presign_upload", f"{key}:{allow_overwrite}"))
        if key in self.existing and not allow_overwrite:
            raise ObjectExistsError("A file with this name already exists")
        return PresignedUploadData(
            upload_url="https://example.test/put",
            headers={"Content-Type": content_type},
            key=normalize_key(key),
            expires_in=expires_in,
        )

    def generate_download_url(self, key, expires_in=3600, filename: str | None = None):
        return PresignedDownloadData(
            download_url="https://example.test/get", key=key, expires_in=expires_in
        )


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
    ok = client.post(
        "/api/objects/presign-upload", json={"key": "new.txt", "content_type": "text/plain"}
    )
    assert ok.status_code == 200 and ok.json()["method"] == "PUT"
    bad_type = client.post(
        "/api/objects/presign-upload", json={"key": "n.txt", "content_type": "bad\r\ntype"}
    )
    assert bad_type.status_code == 422
    too_big = client.post("/api/objects/presign-upload", json={"key": "n.txt", "size": 10**13})
    assert too_big.status_code == 413


def test_presign_upload_defaults_content_type(client):
    res = client.post("/api/objects/presign-upload", json={"key": "new.bin"})
    assert res.status_code == 200
    assert res.json()["headers"] == {"Content-Type": "application/octet-stream"}


def test_presign_download_missing_object_is_404(client):
    assert (
        client.get("/api/objects/presign-download", params={"key": "nope.txt"}).status_code == 404
    )
    assert (
        client.get("/api/objects/presign-download", params={"key": "exists.txt"}).status_code == 200
    )


def test_presign_download_returns_url(client):
    res = client.get(
        "/api/objects/presign-download", params={"key": "exists.txt", "filename": "x.txt"}
    )
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


def test_presign_upload_overwrite_flag_is_forwarded(client, storage):
    blocked = client.post("/api/objects/presign-upload", json={"key": "exists.txt"})
    assert blocked.status_code == 409
    allowed = client.post(
        "/api/objects/presign-upload", json={"key": "exists.txt", "overwrite": True}
    )
    assert allowed.status_code == 200
    assert ("presign_upload", "exists.txt:True") in storage.calls


@pytest.mark.parametrize("action", ["copy", "move"])
def test_object_transfer_success_normalizes_keys(client, storage, action):
    res = client.post(
        f"/api/objects/{action}",
        json={"source": "/exists.txt", "destination": "/docs//new name.txt"},
    )
    assert res.status_code == 200
    assert res.json() == {
        "success": True,
        "source": "exists.txt",
        "destination": "docs/new name.txt",
    }
    assert (f"{action}_object", "exists.txt->docs/new name.txt:False") in storage.calls


@pytest.mark.parametrize("action", ["copy", "move"])
def test_object_transfer_errors(client, action):
    missing = client.post(
        f"/api/objects/{action}", json={"source": "nope.txt", "destination": "x.txt"}
    )
    assert missing.status_code == 404
    for bad in ("/", "a/", "../x", "a\\b"):
        res = client.post(
            f"/api/objects/{action}", json={"source": "exists.txt", "destination": bad}
        )
        assert res.status_code == 400, bad
        res = client.post(f"/api/objects/{action}", json={"source": bad, "destination": "x.txt"})
        assert res.status_code == 400, bad


@pytest.mark.parametrize("action", ["copy", "move"])
def test_object_transfer_conflicts_unless_overwrite(client, storage, action):
    storage.existing.add("taken.txt")
    conflict = client.post(
        f"/api/objects/{action}", json={"source": "exists.txt", "destination": "taken.txt"}
    )
    assert conflict.status_code == 409
    assert conflict.json() == {"detail": "A file with this name already exists"}

    forced = client.post(
        f"/api/objects/{action}",
        json={"source": "exists.txt", "destination": "taken.txt", "overwrite": True},
    )
    assert forced.status_code == 200
    assert (f"{action}_object", "exists.txt->taken.txt:True") in storage.calls


@pytest.mark.parametrize("action", ["copy", "move"])
def test_folder_transfer_success_normalizes_paths(client, storage, action):
    res = client.post(
        f"/api/folders/{action}", json={"source": "/docs//old", "destination": "archive/new/"}
    )
    assert res.status_code == 200
    assert res.json() == {
        "success": True,
        "source": "docs/old/",
        "destination": "archive/new/",
        "item_count": 5,
    }
    assert (f"{action}_folder", "docs/old/->archive/new/") in storage.calls


@pytest.mark.parametrize("action", ["copy", "move"])
def test_folder_transfer_rejects_root_and_traversal_and_conflicts(client, action):
    for bad in ("/", "//", "..", "a/../b"):
        assert (
            client.post(
                f"/api/folders/{action}", json={"source": "docs", "destination": bad}
            ).status_code
            == 400
        )
        assert (
            client.post(
                f"/api/folders/{action}", json={"source": bad, "destination": "docs2"}
            ).status_code
            == 400
        )
    taken = client.post(f"/api/folders/{action}", json={"source": "docs", "destination": "taken"})
    assert taken.status_code == 409


def test_list_without_limit_keeps_returning_everything(client, storage):
    body = client.get("/api/objects").json()
    assert body["next_cursor"] is None and body["has_more"] is False
    assert not any(name == "list_page" for name, _ in storage.calls)


def test_list_pages_with_limit_and_cursor(client, storage):
    first = client.get("/api/objects", params={"prefix": "/docs", "limit": 2}).json()
    assert [o["name"] for o in first["objects"]] == ["f000.txt", "f001.txt"]
    assert first["has_more"] is True and first["next_cursor"] == "2"
    assert first["prefix"] == "docs/"
    assert ("list_page", "docs/|2|None") in storage.calls

    last = client.get("/api/objects", params={"prefix": "docs", "limit": 10, "cursor": "2"}).json()
    assert [o["name"] for o in last["objects"]] == ["f002.txt", "f003.txt", "f004.txt"]
    assert last["has_more"] is False and last["next_cursor"] is None
    assert last["total_size"] == 30


def test_cursor_alone_uses_the_default_page_size(client, storage):
    client.get("/api/objects", params={"cursor": "1"})
    assert ("list_page", "|500|1") in storage.calls


@pytest.mark.parametrize("limit", ["0", "1001", "-5", "abc"])
def test_list_rejects_invalid_limits(client, limit):
    assert client.get("/api/objects", params={"limit": limit}).status_code == 422


def test_single_upload_over_5_gib_must_use_multipart(client):
    res = client.post(
        "/api/objects/presign-upload", json={"key": "big.bin", "size": 5 * 1024**3 + 1}
    )
    assert res.status_code == 413
    assert "parts" in res.json()["detail"]
    ok = client.post("/api/objects/presign-upload", json={"key": "big.bin", "size": 5 * 1024**3})
    assert ok.status_code == 200


class TestMultipartRoutes:
    def test_create_returns_server_chosen_part_plan(self, client, storage):
        res = client.post(
            "/api/uploads/multipart",
            json={"key": "/big//file.bin", "size": 70 * 1024**2, "content_type": "application/zip"},
        )
        assert res.status_code == 200
        assert res.json() == {
            "key": "big/file.bin",
            "upload_id": "up-1",
            "part_size": 32 * 1024**2,
            "part_count": 3,
        }
        assert ("mp_create", "big/file.bin|application/zip|73400320|False") in storage.calls

    def test_create_refuses_existing_unless_overwrite(self, client, storage):
        assert (
            client.post(
                "/api/uploads/multipart", json={"key": "exists.txt", "size": 10}
            ).status_code
            == 409
        )
        forced = client.post(
            "/api/uploads/multipart", json={"key": "exists.txt", "size": 10, "overwrite": True}
        )
        assert forced.status_code == 200
        assert ("mp_create", "exists.txt|application/octet-stream|10|True") in storage.calls

    @pytest.mark.parametrize(
        "body",
        [
            {"key": "x.bin", "size": 0},
            {"key": "x.bin", "size": -1},
            {"key": "x.bin", "size": 10, "content_type": "bad\r\ntype"},
            {"key": "../x", "size": 10},
            {"key": "/", "size": 10},
        ],
    )
    def test_create_validates_input(self, client, body):
        assert client.post("/api/uploads/multipart", json=body).status_code in (400, 422)

    def test_create_enforces_the_overall_size_limit(self, client):
        res = client.post(
            "/api/uploads/multipart", json={"key": "x.bin", "size": settings.MAX_UPLOAD_BYTES + 1}
        )
        assert res.status_code == 413

    def test_part_urls_are_deduplicated_and_sorted(self, client, storage):
        res = client.post(
            "/api/uploads/multipart/parts",
            json={"key": "big.bin", "upload_id": "up-1", "part_numbers": [3, 1, 3, 2]},
        )
        assert res.status_code == 200
        assert [p["part_number"] for p in res.json()["parts"]] == [1, 2, 3]
        assert ("mp_presign", "big.bin|up-1|[1, 2, 3]") in storage.calls

    @pytest.mark.parametrize("numbers", [[], list(range(1, 102))])
    def test_part_url_requests_are_bounded(self, client, numbers):
        res = client.post(
            "/api/uploads/multipart/parts",
            json={"key": "big.bin", "upload_id": "up-1", "part_numbers": numbers},
        )
        assert res.status_code == 422

    def test_uploaded_parts_can_be_listed_to_resume(self, client):
        res = client.get(
            "/api/uploads/multipart/parts", params={"key": "big.bin", "upload_id": "up-1"}
        )
        assert res.status_code == 200
        assert res.json()["parts"] == [{"part_number": 1, "size": 32 * 1024**2, "etag": "e1"}]
        missing = client.get(
            "/api/uploads/multipart/parts", params={"key": "big.bin", "upload_id": "gone"}
        )
        assert missing.status_code == 404

    def test_complete_and_incomplete(self, client):
        ok = client.post(
            "/api/uploads/multipart/complete",
            json={"key": "big.bin", "upload_id": "up-1", "part_count": 3},
        )
        assert ok.status_code == 200
        assert ok.json() == {"success": True, "key": "big.bin", "etag": "etag-final"}
        short = client.post(
            "/api/uploads/multipart/complete",
            json={"key": "big.bin", "upload_id": "up-1", "part_count": 2},
        )
        assert short.status_code == 409
        assert "missing" in short.json()["detail"]
        assert (
            client.post(
                "/api/uploads/multipart/complete",
                json={"key": "big.bin", "upload_id": "up-1", "part_count": 0},
            ).status_code
            == 422
        )

    def test_abort(self, client, storage):
        res = client.post(
            "/api/uploads/multipart/abort", json={"key": "/big.bin", "upload_id": "up-1"}
        )
        assert res.status_code == 200 and res.json() == {"success": True}
        assert ("mp_abort", "big.bin|up-1") in storage.calls

    def test_upload_ids_are_required(self, client):
        assert (
            client.post(
                "/api/uploads/multipart/abort", json={"key": "big.bin", "upload_id": ""}
            ).status_code
            == 422
        )
        assert (
            client.post("/api/uploads/multipart/abort", json={"key": "big.bin"}).status_code == 422
        )


class TestFolderTree:
    def test_returns_every_file_with_sizes_and_empty_folders(self, client, storage):
        res = client.get("/api/folders/tree", params={"prefix": "/photos//"})
        assert res.status_code == 200
        assert res.json() == {
            "prefix": "photos/",
            "files": [
                {"key": "photos/a.txt", "size": 3},
                {"key": "photos/x/b.txt", "size": 4},
            ],
            "empty_folders": ["photos/empty/"],
            "total_size": 7,
        }
        assert ("tree", "photos/|10000") in storage.calls

    @pytest.mark.parametrize("prefix", ["/", "", "..", "a/.."])
    def test_rejects_the_bucket_root_and_traversal(self, client, prefix):
        assert client.get("/api/folders/tree", params={"prefix": prefix}).status_code == 400

    def test_too_many_files_is_413(self, client, storage):
        storage.fail_with = PayloadTooLargeError("too many")
        assert client.get("/api/folders/tree", params={"prefix": "big/"}).status_code == 413


class TestPresignDownloads:
    def test_returns_one_link_per_key_in_order(self, client):
        res = client.post("/api/objects/presign-downloads", json={"keys": ["/b.txt", "a//c.txt"]})
        assert res.status_code == 200
        body = res.json()
        assert [item["key"] for item in body["items"]] == ["b.txt", "a/c.txt"]
        assert all(item["download_url"] == "https://example.test/get" for item in body["items"])
        assert body["expires_in"] == 3600

    @pytest.mark.parametrize("keys", [[], ["x"] * 101])
    def test_needs_between_one_and_a_hundred_keys(self, client, keys):
        assert client.post("/api/objects/presign-downloads", json={"keys": keys}).status_code == 422

    @pytest.mark.parametrize("key", ["", "a/", "../x", "a\b"])
    def test_rejects_invalid_keys(self, client, key):
        res = client.post("/api/objects/presign-downloads", json={"keys": ["ok.txt", key]})
        assert res.status_code == 400

    def test_accepts_exactly_a_hundred_keys(self, client):
        res = client.post("/api/objects/presign-downloads", json={"keys": ["k"] * 100})
        assert res.status_code == 200
        assert len(res.json()["items"]) == 100
