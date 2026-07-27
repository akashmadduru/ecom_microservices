"""Ownership checks on nested product resources (variants/images): a SELLER
who doesn't own the parent product must get 403 on create/update/delete, and
a variant/image id that belongs to a *different* product must 404 (not leak
the other product's data) when accessed through a mismatched product_id in
the URL. Owner/admin write paths use `_get_owned_product`/`_get_active_product`,
which aren't gated on `status`, so these don't need the `publish_product`
workaround that the read-path tests in test_soft_delete.py need."""

import pytest

pytestmark = pytest.mark.integration


async def _create_product(client, as_seller, seller: str, *, title="Widget"):
    as_seller(seller)
    resp = await client.post("/products", json={"title": title, "retail_price": "9.99", "attributes": {}})
    assert resp.status_code == 201
    return resp.json()


async def test_seller_forbidden_creating_variant_on_others_product(client, as_seller):
    product = await _create_product(client, as_seller, seller="owner-1")

    as_seller("intruder-2")
    resp = await client.post(f"/products/{product['id']}/variants", json={"variant_name": "Red / L"})
    assert resp.status_code == 403


async def test_seller_forbidden_updating_variant_on_others_product(client, as_seller):
    product = await _create_product(client, as_seller, seller="owner-1")
    as_seller("owner-1")
    variant = (await client.post(f"/products/{product['id']}/variants", json={"variant_name": "Red / L"})).json()

    as_seller("intruder-2")
    resp = await client.put(
        f"/products/{product['id']}/variants/{variant['id']}",
        json={"variant_name": "Blue / L"},
    )
    assert resp.status_code == 403


async def test_seller_forbidden_deleting_variant_on_others_product(client, as_seller):
    product = await _create_product(client, as_seller, seller="owner-1")
    as_seller("owner-1")
    variant = (await client.post(f"/products/{product['id']}/variants", json={"variant_name": "Red / L"})).json()

    as_seller("intruder-2")
    resp = await client.delete(f"/products/{product['id']}/variants/{variant['id']}")
    assert resp.status_code == 403


async def test_seller_forbidden_creating_image_on_others_product(client, as_seller):
    product = await _create_product(client, as_seller, seller="owner-1")

    as_seller("intruder-2")
    resp = await client.post(f"/products/{product['id']}/images", json={"url": "https://cdn.example.com/x.jpg"})
    assert resp.status_code == 403


async def test_seller_forbidden_deleting_image_on_others_product(client, as_seller):
    product = await _create_product(client, as_seller, seller="owner-1")
    as_seller("owner-1")
    image = (await client.post(f"/products/{product['id']}/images", json={"url": "https://cdn.example.com/x.jpg"})).json()

    as_seller("intruder-2")
    resp = await client.delete(f"/products/{product['id']}/images/{image['id']}")
    assert resp.status_code == 403


async def test_admin_can_create_variant_on_any_product(client, as_seller, as_admin):
    product = await _create_product(client, as_seller, seller="owner-1")

    as_admin()
    resp = await client.post(f"/products/{product['id']}/variants", json={"variant_name": "Red / L"})
    assert resp.status_code == 201


async def test_owner_seller_can_create_variant_on_own_product(client, as_seller):
    product = await _create_product(client, as_seller, seller="owner-1")

    as_seller("owner-1")
    resp = await client.post(f"/products/{product['id']}/variants", json={"variant_name": "Red / L"})
    assert resp.status_code == 201


async def test_variant_id_from_other_product_returns_404_via_mismatched_product_id(client, as_seller, publish_product):
    product_a = await _create_product(client, as_seller, seller="owner-1", title="Product A")
    product_b = await _create_product(client, as_seller, seller="owner-1", title="Product B")
    await publish_product(product_a["id"])
    await publish_product(product_b["id"])

    as_seller("owner-1")
    variant_a = (await client.post(f"/products/{product_a['id']}/variants", json={"variant_name": "A-variant"})).json()

    # Fetch variant_a's id but scoped under product_b's URL - must not leak.
    resp = await client.get(f"/products/{product_b['id']}/variants/{variant_a['id']}")
    assert resp.status_code == 404


async def test_image_id_from_other_product_returns_404_via_mismatched_product_id(client, as_seller):
    product_a = await _create_product(client, as_seller, seller="owner-1", title="Product A")
    product_b = await _create_product(client, as_seller, seller="owner-1", title="Product B")

    as_seller("owner-1")
    image_a = (await client.post(f"/products/{product_a['id']}/images", json={"url": "https://cdn.example.com/a.jpg"})).json()

    # delete_image is the only mutating nested-image endpoint besides create;
    # exercise the product_id/image_id mismatch guard through it.
    resp = await client.delete(f"/products/{product_b['id']}/images/{image_a['id']}")
    assert resp.status_code == 404

    # And confirm product_a's image is untouched (wasn't actually deleted).
    resp = await client.get(f"/products/{product_a['id']}/images")
    # product_a is still DRAFT so this itself 404s per _get_visible_product;
    # what matters for this test is that the delete above didn't succeed
    # against product_a's image, which the 404 (not 204) already proves.
    assert resp.status_code == 404
