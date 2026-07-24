"""Unit tests for `seeder._build_record` in isolation — no DB, no CSV file,
just the row -> insertable-dict normalization. A full CSV seed run
(`seed_from_csv`) is deliberately out of scope here (see tests/test-plan.md);
this only pins down the pure normalization logic that's easy to regress."""

from decimal import Decimal

from product_service.seeder import _build_record, _deterministic_uniq_id


def test_build_record_valid_row_has_title_and_slug_not_product_name():
    row = {
        "title": "Ant Esports GW180 Corsa Gaming Racing Wheel",
        "category": "Gaming",
        "sub_category": "Accessories",
        "brand": "Ant Esports",
        "price": "89.99",
        "discount": "10.00",
        "rating": "4.3",
        "imageUrl": "https://cdn.example.com/img.jpg",
        "description": "Force-feedback racing wheel.",
    }
    record = _build_record(row)

    assert record is not None
    assert "product_name" not in record
    assert record["title"] == "Ant Esports GW180 Corsa Gaming Racing Wheel"
    assert record["slug"].startswith("ant-esports-gw180-corsa-gaming-racing-wheel-")
    assert record["retail_price"] == Decimal("89.99")
    assert record["discount"] == Decimal("10.00")
    assert record["rating"] == Decimal("4.3")
    assert record["category"] == "Gaming"
    assert record["sub_category"] == "Accessories"
    assert record["brand"] == "Ant Esports"
    assert record["image_urls"] == "https://cdn.example.com/img.jpg"
    assert record["review_count"] == 0
    assert record["seller_id"] is None


def test_build_record_missing_title_returns_none():
    assert _build_record({"title": "", "category": "Gaming"}) is None
    assert _build_record({"category": "Gaming"}) is None
    assert _build_record({"title": "   "}) is None


def test_build_record_defaults_category_and_subcategory_and_brand():
    record = _build_record({"title": "Widget"})
    assert record is not None
    assert record["category"] == "product"
    assert record["sub_category"] == "sub-product"
    assert record["brand"] == "brand"


def test_build_record_bad_numeric_fields_default_to_zero_not_raise():
    record = _build_record({"title": "Widget", "price": "not-a-number", "discount": "n/a", "rating": "??"})
    assert record is not None
    assert record["retail_price"] == Decimal("0")
    assert record["discount"] == Decimal("0")
    assert record["rating"] == Decimal("0")


def test_build_record_missing_numeric_fields_default_to_zero():
    record = _build_record({"title": "Widget"})
    assert record is not None
    assert record["retail_price"] == Decimal("0")
    assert record["discount"] == Decimal("0")
    assert record["rating"] == Decimal("0")


def test_build_record_uniq_id_deterministic_same_inputs():
    row = {"title": "Widget", "category": "Toys", "price": "9.99"}
    first = _build_record(row)
    second = _build_record(dict(row))
    assert first["uniq_id"] == second["uniq_id"]
    assert first["slug"] == second["slug"]


def test_build_record_uniq_id_changes_with_content():
    a = _deterministic_uniq_id("Widget", "Toys", "9.99")
    b = _deterministic_uniq_id("Widget", "Toys", "19.99")
    c = _deterministic_uniq_id("Gadget", "Toys", "9.99")
    assert len({a, b, c}) == 3


def test_build_record_no_image_url_defaults_empty_string():
    record = _build_record({"title": "Widget"})
    assert record is not None
    assert record["product_url"] is None
    assert record["image_urls"] == ""
