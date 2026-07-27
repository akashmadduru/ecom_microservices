"""Unit tests for `repo.slugify` — pure string normalization, no DB
required. `generate_unique_slug` (which does hit the DB to disambiguate) is
exercised in tests/integration/test_product_crud.py and
test_category_hierarchy.py instead, since it needs a real session."""

from product_service.repo import slugify


def test_slugify_lowercases_and_hyphenates():
    assert slugify("Ant Esports GW180 Corsa") == "ant-esports-gw180-corsa"


def test_slugify_collapses_punctuation():
    assert slugify("Wi-Fi Router!! (2.4GHz/5GHz)") == "wi-fi-router-2-4ghz-5ghz"


def test_slugify_strips_leading_trailing_separators():
    assert slugify("  --Electronics--  ") == "electronics"


def test_slugify_empty_or_blank_defaults_to_item():
    assert slugify("") == "item"
    assert slugify(None) == "item"
    assert slugify("!!!") == "item"


def test_slugify_underscore_separator_for_ltree_labels():
    # Category slugs/path segments must be ltree-label-safe: letters,
    # digits, underscores only (see repo.slugify's docstring and
    # CategoryRepository.get_subtree) — hyphens would break `path::ltree`
    # casts, so category creation uses sep="_".
    assert slugify("Mobile Phones & Accessories", sep="_") == "mobile_phones_accessories"
