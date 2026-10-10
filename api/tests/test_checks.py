import pytest

from app.api.checks import check_upload_size
from app.core.config import settings
from app.core.limits import GIB, MIB, SINGLE_UPLOAD_MAX_BYTES, TIB
from app.services.storage.exceptions import PayloadTooLargeError


def test_accepts_files_within_the_limits_and_unknown_sizes():
    check_upload_size(None)
    check_upload_size(0)
    check_upload_size(SINGLE_UPLOAD_MAX_BYTES, single_request=True)
    check_upload_size(settings.MAX_UPLOAD_BYTES)


def test_refuses_files_over_the_configured_limit(monkeypatch):
    monkeypatch.setattr(settings, "MAX_UPLOAD_BYTES", 10 * GIB)
    with pytest.raises(PayloadTooLargeError, match="10 GiB upload limit"):
        check_upload_size(10 * GIB + 1)


def test_shows_a_small_limit_in_mib(monkeypatch):
    monkeypatch.setattr(settings, "MAX_UPLOAD_BYTES", 200 * MIB)
    with pytest.raises(PayloadTooLargeError, match="200 MiB upload limit"):
        check_upload_size(201 * MIB)


def test_files_too_big_for_one_request_must_go_in_parts():
    check_upload_size(SINGLE_UPLOAD_MAX_BYTES + 1)  # fine for a multipart upload
    with pytest.raises(PayloadTooLargeError, match="Files over 5 GiB must be uploaded in parts"):
        check_upload_size(SINGLE_UPLOAD_MAX_BYTES + 1, single_request=True)


def test_shows_the_default_limit_in_tib():
    with pytest.raises(PayloadTooLargeError, match="5 TiB upload limit"):
        check_upload_size(settings.MAX_UPLOAD_BYTES + 1)
    assert settings.MAX_UPLOAD_BYTES == 5 * TIB
