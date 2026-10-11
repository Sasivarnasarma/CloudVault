"""Serving a built web app from the API (the Docker image's single process)."""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.web import IMMUTABLE, REVALIDATE, mount_web_app


@pytest.fixture
def dist(tmp_path):
    (tmp_path / "assets").mkdir()
    (tmp_path / "index.html").write_text('<div id="root"></div>')
    (tmp_path / "assets" / "app-abc123.js").write_text("console.log(1)")
    (tmp_path / "favicon.svg").write_text("<svg/>")
    (tmp_path.parent / "secret.txt").write_text("outside the web app")
    return tmp_path


@pytest.fixture
def client(dist):
    app = FastAPI()

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    assert mount_web_app(app, dist) is True
    return TestClient(app)


def test_the_root_and_unknown_paths_open_the_app(client):
    for path in ["/", "/?p=docs/2025&q=report", "/trash", "/some/deep/route"]:
        res = client.get(path)
        assert res.status_code == 200, path
        assert '<div id="root">' in res.text, path
        assert res.headers["cache-control"] == REVALIDATE


def test_real_files_are_sent_as_they_are(client):
    res = client.get("/favicon.svg")
    assert res.text == "<svg/>"
    assert res.headers["cache-control"] == REVALIDATE


def test_hashed_assets_can_be_cached_for_ever(client):
    res = client.get("/assets/app-abc123.js")
    assert res.text == "console.log(1)"
    assert res.headers["cache-control"] == IMMUTABLE


def test_the_api_keeps_its_own_routes(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_unknown_api_paths_are_a_404_not_the_app(client):
    for path in ["/api/nope", "/api/objects/also-nope", "/api"]:
        res = client.get(path)
        assert res.status_code == 404, path
        assert res.json() == {"detail": "Not found"}


@pytest.mark.parametrize(
    "path", ["/../secret.txt", "/%2e%2e/secret.txt", "/assets/../../secret.txt"]
)
def test_nothing_outside_the_folder_is_served(client, path):
    res = client.get(path)
    assert "outside the web app" not in res.text


def test_a_folder_that_is_not_a_built_app_serves_nothing(tmp_path):
    app = FastAPI()
    assert mount_web_app(app, tmp_path) is False
    assert TestClient(app).get("/").status_code == 404
    assert mount_web_app(app, tmp_path / "missing") is False
