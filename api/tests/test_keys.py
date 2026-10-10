import pytest

from app.services.storage.exceptions import InvalidKeyError
from app.services.storage.keys import normalize_folder, normalize_key, normalize_prefix


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("report.pdf", "report.pdf"),
        ("/docs//a///b.txt", "docs/a/b.txt"),
        (" spaced name .txt", " spaced name .txt"),
        ("ünïcode/файл.txt", "ünïcode/файл.txt"),
    ],
)
def test_normalize_key_accepts_and_canonicalizes(raw, expected):
    assert normalize_key(raw) == expected


@pytest.mark.parametrize(
    "raw",
    ["", "/", "//", "a/", "../x", "a/../b", "a/./b", "a\\b", "a\x00b", "a\nb", "x/ /y", "é" * 600],
)
def test_normalize_key_rejects_unsafe_keys(raw):
    with pytest.raises(InvalidKeyError):
        normalize_key(raw)


@pytest.mark.parametrize("raw", ["", "/", "//", "..", "a/../b", "a\\b"])
def test_normalize_folder_rejects_root_and_unsafe(raw):
    with pytest.raises(InvalidKeyError):
        normalize_folder(raw)


def test_normalize_folder_adds_single_trailing_slash():
    assert normalize_folder("/a//b/") == "a/b/"


def test_normalize_prefix_root_is_empty():
    assert normalize_prefix("") == ""
    assert normalize_prefix("/") == ""
    assert normalize_prefix("a/b") == "a/b/"
    with pytest.raises(InvalidKeyError):
        normalize_prefix("a/..")


@pytest.mark.parametrize(
    "raw",
    [
        ".cloudvault-trash",
        ".cloudvault-trash/",
        ".cloudvault-trash/x/a.txt",
        "/.cloudvault-trash//a",
    ],
)
def test_the_trash_is_reserved_for_every_kind_of_key(raw):
    for normalize in (normalize_key, normalize_folder, normalize_prefix):
        with pytest.raises(InvalidKeyError, match="reserved|cannot end with"):
            normalize(raw)


@pytest.mark.parametrize(
    "raw", [".cloudvault-trash-backup/a", "docs/.cloudvault-trash/a", "x.cloudvault-trash"]
)
def test_names_that_only_look_like_the_trash_are_fine(raw):
    assert normalize_key(raw) == raw
