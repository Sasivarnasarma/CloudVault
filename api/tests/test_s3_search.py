import datetime as dt

import pytest
from botocore.stub import Stubber

from app.services.storage.s3 import S3StorageService

NOW = dt.datetime(2026, 1, 1, tzinfo=dt.UTC)

KEYS = [
    "docs/",
    "docs/Report.pdf",
    "docs/reports/",
    "docs/reports/q1.txt",
    "docs/reports/archive/old-report.txt",
    ".cloudvault-trash/20260101T000000Z-abc123/docs/report.txt",
    "notes.md",
]


@pytest.fixture
def service():
    return S3StorageService()


def obj(key):
    return {"Key": key, "Size": 1, "LastModified": NOW, "ETag": '"e"'}


def run(service, prefix, query, keys=KEYS, limit=100, max_scan=1000, pages=None):
    with Stubber(service.client) as stub:
        for page in pages or [keys]:
            stub.add_response(
                "list_objects_v2",
                {"IsTruncated": False, "Contents": [obj(k) for k in page]},
                {"Bucket": "test-bucket", "Prefix": prefix},
            )
        return service.search(prefix, query, limit, max_scan)


def test_finds_files_and_folders_by_name_at_any_depth_ignoring_case(service):
    result = run(service, "", "report")
    assert [o.key for o in result.objects] == [
        "docs/Report.pdf",
        "docs/reports/archive/old-report.txt",
    ]
    assert [(f.name, f.prefix) for f in result.folders] == [("reports", "docs/reports/")]
    assert result.truncated is False


def test_matches_the_name_only_not_the_path_above_it(service):
    result = run(service, "", "docs")
    assert [f.prefix for f in result.folders] == ["docs/"]
    assert result.objects == []  # "docs/Report.pdf" is named Report.pdf


def test_searches_only_inside_the_given_folder(service):
    keys = ["docs/reports/", "docs/reports/q1.txt", "docs/reports/archive/old-report.txt"]
    result = run(service, "docs/reports/", "report", keys=keys)
    assert [o.key for o in result.objects] == ["docs/reports/archive/old-report.txt"]
    assert result.folders == []  # the folder being searched is not a match for itself


def test_never_looks_inside_the_trash(service):
    result = run(service, "", "report.txt")
    assert all(not o.key.startswith(".cloudvault-trash/") for o in result.objects)


def test_gives_each_file_its_name_content_type_and_size(service):
    [pdf] = run(service, "", "Report.pdf").objects
    assert (pdf.name, pdf.content_type, pdf.size) == ("Report.pdf", "application/pdf", 1)


def test_stops_at_the_result_limit_and_says_so(service):
    keys = [f"a/file{i}.txt" for i in range(10)]
    result = run(service, "", "file", keys=keys, limit=3)
    assert len(result.objects) == 3
    assert result.truncated is True


def test_stops_after_reading_too_many_objects(service):
    keys = [f"a/other{i}.txt" for i in range(10)] + ["a/wanted.txt"]
    result = run(service, "", "wanted", keys=keys, max_scan=5)
    assert result.objects == []
    assert result.truncated is True


def test_a_search_that_ends_exactly_at_the_limit_is_not_called_truncated(service):
    result = run(service, "", "file", keys=["file1.txt", "file2.txt"], limit=3)
    assert len(result.objects) == 2
    assert result.truncated is False
