"""Size limits shared by upload routes."""

MIB = 1024**2
GIB = 1024**3
TIB = 1024**4

# A single presigned PUT is limited to 5 GiB by S3-compatible providers.
SINGLE_UPLOAD_MAX_BYTES = 5 * GIB

# Multipart uploads: 10,000 parts max, 5 MiB min part size (except the last part).
MAX_PARTS = 10_000
MIN_PART_BYTES = 5 * MIB
DEFAULT_PART_BYTES = 32 * MIB
MAX_PART_URLS_PER_REQUEST = 100


def choose_part_size(total_bytes: int) -> int:
    """Smallest part size (>= default, whole MiB) that keeps the part count within limits."""
    needed = -(-total_bytes // MAX_PARTS)
    rounded = -(-needed // MIB) * MIB
    return max(DEFAULT_PART_BYTES, rounded)
