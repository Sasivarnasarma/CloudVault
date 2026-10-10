"""Names and headers derived from object keys."""

import mimetypes
import re
from urllib.parse import quote

DEFAULT_CONTENT_TYPE = "application/octet-stream"

# Types the platform mimetypes database often lacks (notably on Windows).
_EXTRA_TYPES = {
    ".md": "text/markdown",
    ".log": "text/plain",
    ".yml": "application/yaml",
    ".yaml": "application/yaml",
    ".webp": "image/webp",
    ".avif": "image/avif",
}
for _extension, _type in _EXTRA_TYPES.items():
    mimetypes.add_type(_type, _extension)

_FILENAME_UNSAFE = re.compile(r'[\x00-\x1f\x7f"\\;]')


def display_name(key: str) -> str:
    """The name to show for an object key or folder prefix: its last path segment."""
    return key.rstrip("/").rsplit("/", 1)[-1]


def guess_content_type(key: str) -> str:
    return mimetypes.guess_type(key)[0] or DEFAULT_CONTENT_TYPE


def content_disposition(filename: str) -> str:
    """Build a safe attachment header (ASCII fallback + RFC 5987 UTF-8 name)."""
    cleaned = _FILENAME_UNSAFE.sub("_", filename).strip() or "download"
    ascii_name = cleaned.encode("ascii", "replace").decode("ascii").replace("?", "_")
    return f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(cleaned, safe='')}"
