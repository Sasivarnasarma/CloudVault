"""Size and count limits shared by the upload and download routes."""

MIB = 1024**2
GIB = 1024**3
TIB = 1024**4

# A single presigned PUT is limited to 5 GiB by S3-compatible providers.
SINGLE_UPLOAD_MAX_BYTES = 5 * GIB

# A single copy request is limited to 5 GiB; bigger objects are copied part by part.
SINGLE_COPY_MAX_BYTES = 5 * GIB
COPY_PART_BYTES = 256 * MIB
COPY_PARTS_AT_ONCE = 4

# Multipart uploads: 10,000 parts max, 5 MiB min part size (except the last part).
MAX_PARTS = 10_000
MIN_PART_BYTES = 5 * MIB
DEFAULT_PART_BYTES = 32 * MIB
MAX_PART_URLS_PER_REQUEST = 100

# Downloading a folder or a selection as one zip: the browser fetches the files itself.
MAX_ARCHIVE_FILES = 10_000
MAX_DOWNLOAD_URLS_PER_REQUEST = 100

# Searching a folder and everything below it: how much is read and how much is returned.
MAX_SEARCH_SCAN = 50_000
MAX_SEARCH_RESULTS = 300

# Deleting: how many files and folders one request can move to the trash.
MAX_TRASH_ITEMS_PER_REQUEST = 200


def choose_part_size(total_bytes: int) -> int:
    """Smallest part size (>= default, whole MiB) that keeps the part count within limits."""
    needed = -(-total_bytes // MAX_PARTS)
    rounded = -(-needed // MIB) * MIB
    return max(DEFAULT_PART_BYTES, rounded)
