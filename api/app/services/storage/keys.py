"""Object key and folder-prefix normalization.

Object keys are not filesystem paths. These helpers produce canonical keys
(no leading slash, no duplicate separators) and reject anything unsafe.
"""

import re

from app.services.storage.exceptions import InvalidKeyError

MAX_KEY_BYTES = 1024
_CONTROL_CHARS = re.compile(r"[\x00-\x1f\x7f]")


def _normalize(raw: str, what: str) -> str:
    if _CONTROL_CHARS.search(raw):
        raise InvalidKeyError(f"{what} cannot contain control characters")
    if "\\" in raw:
        raise InvalidKeyError(f"{what} cannot contain backslashes")

    segments = [s for s in raw.split("/") if s != ""]
    if any(s in (".", "..") for s in segments):
        raise InvalidKeyError(f"{what} cannot contain '.' or '..' segments")
    if any(not s.strip() for s in segments):
        raise InvalidKeyError(f"{what} cannot contain blank segments")

    normalized = "/".join(segments)
    if len(normalized.encode("utf-8")) > MAX_KEY_BYTES:
        raise InvalidKeyError(f"{what} is too long (max {MAX_KEY_BYTES} bytes)")
    return normalized


def normalize_key(raw: str) -> str:
    """Canonical key for a single file. Must name an object, not a folder."""
    if raw.endswith("/"):
        raise InvalidKeyError("Object key cannot end with '/'")
    key = _normalize(raw, "Object key")
    if not key:
        raise InvalidKeyError("Object key cannot be empty")
    return key


def normalize_folder(raw: str) -> str:
    """Canonical folder prefix ('a/b/'). Never empty (the bucket root is not a folder)."""
    folder = _normalize(raw, "Folder path")
    if not folder:
        raise InvalidKeyError("Folder path cannot be empty")
    return folder + "/"


def normalize_prefix(raw: str) -> str:
    """Canonical listing prefix: '' for the root, otherwise 'a/b/'."""
    prefix = _normalize(raw, "Prefix")
    return prefix + "/" if prefix else ""
