"""Unit test for `_seed_utils.chunk` — pure list-splitting logic, no DB
required. `insert_batch`/`insert_batch_with_fallback`/`resync_sequence` are
exercised at the integration level (`tests/integration/test_catalog_seeder.py`)
since they need a real Postgres connection for `ON CONFLICT` semantics."""

from product_service._seed_utils import chunk


def test_chunk_splits_into_expected_sizes():
    items = [{"n": i} for i in range(7)]
    batches = list(chunk(items, 3))
    assert [len(b) for b in batches] == [3, 3, 1]
    assert [row["n"] for batch in batches for row in batch] == list(range(7))


def test_chunk_exact_multiple_of_size():
    items = [{"n": i} for i in range(6)]
    batches = list(chunk(items, 2))
    assert [len(b) for b in batches] == [2, 2, 2]


def test_chunk_empty_list_yields_no_batches():
    assert list(chunk([], 5)) == []


def test_chunk_size_larger_than_list_yields_one_batch():
    items = [{"n": i} for i in range(3)]
    batches = list(chunk(items, 100))
    assert len(batches) == 1
    assert len(batches[0]) == 3
