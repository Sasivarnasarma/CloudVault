import json

import pytest

from app.services.storage.exceptions import ObjectNotFoundError, StorageError
from app.services.storage.keys import TRASH_PREFIX
from app.services.storage.s3 import S3StorageService
from app.services.storage.s3.trash import BATCH_ID, manifest_key
from tests.fake_s3 import FakeS3


@pytest.fixture
def s3():
    return FakeS3(
        {
            "notes.md": b"hello",
            "docs/a.txt": b"aaaa",
            "docs/sub/b.txt": b"bb",
            "docs/empty/": b"",
            "other/keep.txt": b"keep",
        }
    )


@pytest.fixture
def service(s3):
    service = S3StorageService()
    service.client = s3
    return service


def trash_keys(s3):
    return sorted(k for k in s3.objects if k.startswith(TRASH_PREFIX))


class TestMoveToTrash:
    def test_moves_a_file_and_remembers_where_it_was(self, service, s3):
        batch, failed = service.move_to_trash([("file", "notes.md")])

        assert failed == []
        assert BATCH_ID.match(batch.id)
        assert "notes.md" not in s3.objects
        assert s3.objects[f"{TRASH_PREFIX}{batch.id}/notes.md"] == b"hello"
        assert [(r.path, r.type, r.size, r.item_count) for r in batch.roots] == [
            ("notes.md", "file", 5, 1)
        ]
        assert batch.total_size == 5
        manifest = json.loads(s3.objects[manifest_key(batch.id)])
        assert manifest["roots"][0]["path"] == "notes.md"

    def test_moves_a_folder_with_everything_in_it(self, service, s3):
        batch, failed = service.move_to_trash([("folder", "docs/")])

        assert failed == []
        assert not [k for k in s3.objects if k.startswith("docs/")]
        base = f"{TRASH_PREFIX}{batch.id}/"
        assert {k[len(base) :] for k in trash_keys(s3) if k.startswith(base)} == {
            "docs/a.txt",
            "docs/sub/b.txt",
            "docs/empty/",
        }
        (root,) = batch.roots
        assert (root.path, root.type, root.size, root.item_count) == ("docs/", "folder", 6, 2)

    def test_several_items_make_one_batch_and_leave_the_rest_alone(self, service, s3):
        batch, _ = service.move_to_trash([("file", "notes.md"), ("folder", "docs/")])
        assert [r.path for r in batch.roots] == ["notes.md", "docs/"]
        assert batch.total_size == 11
        assert s3.objects["other/keep.txt"] == b"keep"
        assert len(service.list_trash()) == 1

    def test_reports_what_could_not_be_moved_and_keeps_the_rest(self, service, s3):
        batch, failed = service.move_to_trash([("file", "missing.txt"), ("file", "notes.md")])
        assert [r.path for r in batch.roots] == ["notes.md"]
        assert [f.path for f in failed] == ["missing.txt"]
        assert failed[0].error == "Object not found"

    def test_no_batch_when_nothing_could_be_moved(self, service, s3):
        batch, failed = service.move_to_trash([("file", "missing.txt"), ("folder", "nope/")])
        assert batch is None
        assert [f.path for f in failed] == ["missing.txt", "nope/"]
        assert trash_keys(s3) == []

    def test_a_failed_copy_leaves_the_original_where_it_was(self, service, s3):
        original_copy = s3.copy_object

        def failing_copy(Bucket, Key, CopySource):
            if Key.endswith("docs/sub/b.txt"):
                raise StorageError("boom")
            return original_copy(Bucket, Key, CopySource)

        s3.copy_object = failing_copy
        batch, failed = service.move_to_trash([("folder", "docs/")])

        assert batch is None
        assert failed[0].path == "docs/"
        assert {"docs/a.txt", "docs/sub/b.txt", "docs/empty/"} <= set(s3.objects)
        assert trash_keys(s3) == []  # what was copied has been removed again

    def test_a_file_that_cannot_be_removed_stays_put_and_leaves_no_copy(self, service, s3):
        s3.fail_delete = {"notes.md"}
        batch, failed = service.move_to_trash([("file", "notes.md")])
        assert batch is None
        assert "could not be removed" in failed[0].error
        assert s3.objects["notes.md"] == b"hello"
        assert trash_keys(s3) == []

    def test_a_folder_whose_originals_cannot_all_be_removed_is_still_recoverable(self, service, s3):
        s3.undeletable = {"docs/a.txt"}
        batch, failed = service.move_to_trash([("folder", "docs/")])
        assert [r.path for r in batch.roots] == ["docs/"]
        assert "1 items could not be removed" in failed[0].error


class TestListTrash:
    def test_lists_batches_newest_first(self, service):
        first, _ = service.move_to_trash([("file", "notes.md")])
        second, _ = service.move_to_trash([("folder", "docs/")])
        listed = service.list_trash()
        assert {b.id for b in listed} == {first.id, second.id}
        assert [b.id for b in listed] == sorted([first.id, second.id], reverse=True)
        assert listed[0].deleted_at.tzinfo is not None

    def test_limit_keeps_the_newest(self, service, s3):
        ids = []
        for key in ["notes.md", "docs/a.txt", "other/keep.txt"]:
            batch, _ = service.move_to_trash([("file", key)])
            ids.append(batch.id)
        assert [b.id for b in service.list_trash(limit=2)] == sorted(ids, reverse=True)[:2]

    def test_ignores_leftovers_without_a_readable_manifest(self, service, s3):
        batch, _ = service.move_to_trash([("file", "notes.md")])
        s3.objects[f"{TRASH_PREFIX}20200101T000000Z-aaaaaa/orphan.txt"] = b"x"
        s3.objects[manifest_key("20200101T000000Z-bbbbbb")] = b"not json"
        s3.objects[f"{TRASH_PREFIX}readme.json"] = b"{}"
        assert [b.id for b in service.list_trash()] == [batch.id]

    def test_an_empty_trash_lists_nothing(self, service):
        assert service.list_trash() == []


class TestRestore:
    def test_puts_a_file_back_and_clears_the_batch(self, service, s3):
        batch, _ = service.move_to_trash([("file", "notes.md")])
        restored, failed = service.restore_from_trash(batch.id)

        assert (restored, failed) == (["notes.md"], [])
        assert s3.objects["notes.md"] == b"hello"
        assert trash_keys(s3) == []

    def test_puts_a_folder_back_with_all_its_contents(self, service, s3):
        before = {k: v for k, v in s3.objects.items() if k.startswith("docs/")}
        batch, _ = service.move_to_trash([("folder", "docs/")])
        restored, failed = service.restore_from_trash(batch.id)

        assert (restored, failed) == (["docs/"], [])
        assert {k: v for k, v in s3.objects.items() if k.startswith("docs/")} == before
        assert trash_keys(s3) == []

    def test_never_overwrites_and_keeps_what_could_not_go_back(self, service, s3):
        batch, _ = service.move_to_trash([("file", "notes.md"), ("folder", "docs/")])
        s3.objects["notes.md"] = b"a newer file"

        restored, failed = service.restore_from_trash(batch.id)

        assert restored == ["docs/"]
        assert [f.path for f in failed] == ["notes.md"]
        assert "already exists" in failed[0].error
        assert s3.objects["notes.md"] == b"a newer file"
        # The file is still in the trash and can be restored once the name is free.
        (remaining,) = service.list_trash()
        assert [r.path for r in remaining.roots] == ["notes.md"]
        del s3.objects["notes.md"]
        assert service.restore_from_trash(batch.id) == (["notes.md"], [])
        assert trash_keys(s3) == []

    def test_a_folder_is_not_restored_into_one_that_exists(self, service, s3):
        batch, _ = service.move_to_trash([("folder", "docs/")])
        s3.objects["docs/new.txt"] = b"n"
        restored, failed = service.restore_from_trash(batch.id)
        assert restored == []
        assert "already exists" in failed[0].error

    @pytest.mark.parametrize("batch_id", ["nope", "../x", "20200101T000000Z-aaaaaa"])
    def test_unknown_batches_are_not_found(self, service, batch_id):
        with pytest.raises(ObjectNotFoundError):
            service.restore_from_trash(batch_id)

    def test_restores_only_the_items_asked_for_and_keeps_the_rest_in_the_trash(self, service, s3):
        batch, _ = service.move_to_trash([("file", "notes.md"), ("folder", "docs/")])

        restored, failed = service.restore_from_trash(batch.id, ["docs/"])

        assert (restored, failed) == (["docs/"], [])
        assert "docs/a.txt" in s3.objects and "notes.md" not in s3.objects
        (left,) = service.list_trash()
        assert left.id == batch.id and [r.path for r in left.roots] == ["notes.md"]
        assert service.restore_from_trash(batch.id, ["notes.md"]) == (["notes.md"], [])
        assert trash_keys(s3) == []  # the batch is gone once its last item is back

    def test_an_item_that_is_not_in_the_batch_is_reported_not_guessed(self, service, s3):
        batch, _ = service.move_to_trash([("file", "notes.md")])

        restored, failed = service.restore_from_trash(batch.id, ["other.txt"])

        assert restored == []
        assert [(f.path, f.error) for f in failed] == [
            ("other.txt", "That item is not in this batch")
        ]
        assert "notes.md" not in s3.objects  # nothing else was restored

    def test_an_item_whose_place_is_taken_stays_while_the_others_go_back(self, service, s3):
        batch, _ = service.move_to_trash([("file", "notes.md"), ("folder", "docs/")])
        s3.objects["notes.md"] = b"newer"

        restored, failed = service.restore_from_trash(batch.id, ["notes.md", "docs/"])

        assert restored == ["docs/"] and [f.path for f in failed] == ["notes.md"]
        (left,) = service.list_trash()
        assert [r.path for r in left.roots] == ["notes.md"]


class TestPurge:
    def test_deletes_one_batch_for_good(self, service, s3):
        keep, _ = service.move_to_trash([("file", "notes.md")])
        gone, _ = service.move_to_trash([("folder", "docs/")])

        count = service.purge_trash(gone.id)

        assert count == 4  # the three objects (one is an empty-folder marker) and the manifest
        assert [b.id for b in service.list_trash()] == [keep.id]
        assert not [k for k in trash_keys(s3) if gone.id in k]

    def test_deletes_only_some_items_of_a_batch_and_keeps_the_rest(self, service, s3):
        batch, _ = service.move_to_trash([("file", "notes.md"), ("folder", "docs/")])

        count = service.purge_trash(batch.id, ["docs/"])

        assert count == 3  # the folder's three objects; the batch itself stays
        (left,) = service.list_trash()
        assert [r.path for r in left.roots] == ["notes.md"]
        assert s3.objects[f"{TRASH_PREFIX}{batch.id}/notes.md"] == b"hello"
        assert not [k for k in trash_keys(s3) if "/docs/" in k]

    def test_deleting_the_last_items_removes_the_whole_batch(self, service, s3):
        batch, _ = service.move_to_trash([("file", "notes.md"), ("file", "other/keep.txt")])
        service.purge_trash(batch.id, ["notes.md"])
        service.purge_trash(batch.id, ["other/keep.txt"])
        assert trash_keys(s3) == []

    def test_deleting_items_that_are_not_in_the_batch_is_not_found(self, service):
        batch, _ = service.move_to_trash([("file", "notes.md")])
        with pytest.raises(ObjectNotFoundError):
            service.purge_trash(batch.id, ["nothing.txt"])

    def test_empties_the_whole_trash_and_nothing_else(self, service, s3):
        service.move_to_trash([("file", "notes.md")])
        service.move_to_trash([("folder", "docs/")])
        outside = {k for k in s3.objects if not k.startswith(TRASH_PREFIX)}

        assert service.purge_trash() > 0
        assert trash_keys(s3) == []
        assert set(s3.objects) == outside

    def test_refuses_a_malformed_id(self, service):
        with pytest.raises(ObjectNotFoundError):
            service.purge_trash("../../etc")

    def test_reports_objects_that_could_not_be_deleted(self, service, s3):
        batch, _ = service.move_to_trash([("file", "notes.md")])
        s3.undeletable = {f"{TRASH_PREFIX}{batch.id}/notes.md"}
        with pytest.raises(StorageError, match="could not be deleted"):
            service.purge_trash(batch.id)


class TestTheTrashIsHidden:
    def test_the_trash_folder_is_not_listed_at_the_top(self, service):
        service.move_to_trash([("file", "notes.md")])
        folders, objects = service.list_objects()
        assert [f.name for f in folders] == ["docs", "other"]
        assert [o.name for o in objects] == []

    def test_a_paged_listing_hides_it_too(self, service):
        service.move_to_trash([("file", "notes.md")])
        folders, _, _ = service.list_page(limit=10)
        assert TRASH_PREFIX not in [f.prefix for f in folders]
