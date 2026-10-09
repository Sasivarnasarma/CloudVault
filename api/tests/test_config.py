import pytest
from pydantic import ValidationError

from app.core.config import Settings

REQUIRED = {"S3_BUCKET": "b", "S3_ACCESS_KEY": "k", "S3_SECRET_KEY": "s"}
CLEARED = (*REQUIRED, "S3_ENDPOINT", "STORAGE_PROVIDER", "CORS_ORIGINS")


def make(monkeypatch, **overrides) -> Settings:
    for name in CLEARED:
        monkeypatch.delenv(name, raising=False)
    for name, value in {**REQUIRED, **overrides}.items():
        monkeypatch.setenv(name, value)
    return Settings(_env_file=None)


@pytest.mark.parametrize("missing", sorted(REQUIRED))
def test_storage_credentials_are_required(monkeypatch, missing):
    for name in REQUIRED:
        monkeypatch.setenv(name, "x")
    monkeypatch.delenv(missing)
    with pytest.raises(ValidationError):
        Settings(_env_file=None)


def test_provider_is_normalized_and_validated(monkeypatch):
    assert make(monkeypatch, STORAGE_PROVIDER=" R2 ").STORAGE_PROVIDER == "r2"
    with pytest.raises(ValidationError):
        make(monkeypatch, STORAGE_PROVIDER="dropbox")


def test_empty_endpoint_means_aws(monkeypatch):
    assert make(monkeypatch, S3_ENDPOINT="").S3_ENDPOINT is None


def test_cors_origins_parse_from_json(monkeypatch):
    cfg = make(monkeypatch, CORS_ORIGINS='["https://a.example","https://b.example"]')
    assert cfg.CORS_ORIGINS == ["https://a.example", "https://b.example"]


def test_defaults_allow_local_dev_origin(monkeypatch):
    assert "http://localhost:5173" in make(monkeypatch).CORS_ORIGINS
