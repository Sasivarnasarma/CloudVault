import pytest

from app.core.limits import (
    DEFAULT_PART_BYTES,
    GIB,
    MAX_PARTS,
    MIB,
    MIN_PART_BYTES,
    choose_part_size,
)


@pytest.mark.parametrize("size", [1, 5 * MIB, 64 * MIB, 10 * GIB, 300 * GIB])
def test_small_and_medium_files_use_the_default_part_size(size):
    assert choose_part_size(size) == DEFAULT_PART_BYTES


@pytest.mark.parametrize("size", [400 * GIB, 1024 * GIB, 5 * 1024 * GIB, 5 * 1024 * GIB - 1])
def test_huge_files_grow_the_part_size_to_stay_within_the_part_limit(size):
    part = choose_part_size(size)
    assert part % MIB == 0
    assert part >= DEFAULT_PART_BYTES
    assert -(-size // part) <= MAX_PARTS


def test_part_size_never_goes_below_the_provider_minimum():
    assert choose_part_size(1) >= MIN_PART_BYTES
