"""Folder copies and moves that report their progress as a stream of JSON lines."""

import json

import pytest

from app.services.storage.exceptions import TransferCancelledError
from app.services.storage.s3 import S3StorageService
from tests.fake_s3 import FakeS3
from tests.test_api import client, storage  # noqa: F401  (fixtures)

NDJSON = {"Accept": "application/x-ndjson"}


def events(response):
    assert response.headers["content-type"].startswith("application/x-ndjson")
    return [json.loads(line) for line in response.text.splitlines()]


class TestStreamedFolderTransfer:
    def test_copy_streams_progress_then_the_usual_result(self, client, storage):  # noqa: F811
        res = client.post(
            "/api/folders/copy", json={"source": "a", "destination": "b"}, headers=NDJSON
        )
        assert res.status_code == 200
        got = events(res)
        assert [e for e in got if e["type"] == "progress"] == [
            {"type": "progress", "done": n, "total": 5} for n in range(6)
        ]
        assert got[-1] == {
            "type": "done",
            "result": {
                "success": True,
                "source": "a/",
                "destination": "b/",
                "item_count": 5,
            },
        }

    def test_move_streams_too(self, client):  # noqa: F811
        res = client.post(
            "/api/folders/move", json={"source": "a", "destination": "b"}, headers=NDJSON
        )
        assert events(res)[-1]["type"] == "done"

    def test_a_failure_comes_as_an_event_with_the_status_it_would_have_had(self, client):  # noqa: F811
        res = client.post(
            "/api/folders/copy", json={"source": "a", "destination": "taken"}, headers=NDJSON
        )
        assert events(res) == [
            {"type": "error", "status": 409, "detail": "A folder with this name already exists"}
        ]

    def test_without_the_header_the_answer_is_plain_json(self, client):  # noqa: F811
        res = client.post("/api/folders/copy", json={"source": "a", "destination": "b"})
        assert res.json()["item_count"] == 5


@pytest.fixture
def s3():
    return FakeS3({f"src/f{i}.txt": b"x" for i in range(5)})


@pytest.fixture
def service(s3):
    service = S3StorageService()
    service.client = s3
    return service


class TestServiceProgress:
    def test_reports_before_the_first_object_and_after_each_one(self, service):
        seen = []
        service.copy_folder("src", "dst", lambda done, total: seen.append((done, total)))
        assert seen == [(n, 5) for n in range(6)]

    def test_a_move_reports_the_copying(self, service, s3):
        seen = []
        service.move_folder("src", "dst", lambda done, total: seen.append(done))
        assert seen[-1] == 5
        assert not any(k.startswith("src/") for k in s3.objects)

    def test_stopping_part_way_removes_what_was_copied(self, service, s3):
        def stop_after_two(done, total):
            if done == 2:
                raise TransferCancelledError()

        with pytest.raises(TransferCancelledError):
            service.move_folder("src", "dst", stop_after_two)
        assert not any(k.startswith("dst/") for k in s3.objects)
        assert sum(k.startswith("src/") for k in s3.objects) == 5  # the originals are untouched
