"""Category hierarchy: path/depth computation on create, multi-level subtree
queries (exercising the ltree `<@` predicate, not just a flat parent_id
match), and the two independent 409 delete-conflict guards (children present,
products referencing the category)."""

import pytest

pytestmark = pytest.mark.integration


async def _create_category(client, as_admin, name: str, parent_id: int | None = None):
    as_admin()
    resp = await client.post("/admin/products/categories", json={"name": name, "parent_id": parent_id})
    assert resp.status_code == 201, resp.text
    return resp.json()


async def test_root_category_has_depth_zero_and_path_is_its_own_slug(client, as_admin):
    root = await _create_category(client, as_admin, "Electronics")
    assert root["depth"] == 0
    assert root["path"] == "electronics"
    assert root["parent_id"] is None


async def test_child_category_computes_path_and_depth_from_parent(client, as_admin):
    root = await _create_category(client, as_admin, "Electronics")
    child = await _create_category(client, as_admin, "Mobile Phones", parent_id=root["id"])

    assert child["depth"] == 1
    assert child["path"] == f"{root['path']}.{child['slug']}"
    assert child["parent_id"] == root["id"]


async def test_grandchild_category_computes_path_and_depth(client, as_admin):
    root = await _create_category(client, as_admin, "Electronics")
    child = await _create_category(client, as_admin, "Mobile Phones", parent_id=root["id"])
    grandchild = await _create_category(client, as_admin, "Smartphones", parent_id=child["id"])

    assert grandchild["depth"] == 2
    assert grandchild["path"] == f"{root['path']}.{child['slug']}.{grandchild['slug']}"


async def test_subtree_returns_multilevel_descendants_not_sibling_branch(client, as_admin):
    root = await _create_category(client, as_admin, "Electronics")
    child = await _create_category(client, as_admin, "Mobile Phones", parent_id=root["id"])
    grandchild = await _create_category(client, as_admin, "Smartphones", parent_id=child["id"])
    great_grandchild = await _create_category(client, as_admin, "5G Smartphones", parent_id=grandchild["id"])

    # Sibling branch off root, must NOT show up in root's subtree beyond root itself.
    sibling = await _create_category(client, as_admin, "Home Appliances")
    sibling_child = await _create_category(client, as_admin, "Refrigerators", parent_id=sibling["id"])

    resp = await client.get(f"/products/categories/{root['id']}/subtree")
    assert resp.status_code == 200
    ids = {c["id"] for c in resp.json()}

    assert ids == {root["id"], child["id"], grandchild["id"], great_grandchild["id"]}
    assert sibling["id"] not in ids
    assert sibling_child["id"] not in ids


async def test_subtree_of_leaf_returns_only_itself(client, as_admin):
    root = await _create_category(client, as_admin, "Electronics")
    child = await _create_category(client, as_admin, "Mobile Phones", parent_id=root["id"])

    resp = await client.get(f"/products/categories/{child['id']}/subtree")
    assert resp.status_code == 200
    ids = {c["id"] for c in resp.json()}
    assert ids == {child["id"]}


async def test_subtree_of_nonexistent_category_returns_404(client):
    resp = await client.get("/products/categories/999999/subtree")
    assert resp.status_code == 404


async def test_delete_category_with_children_conflicts(client, as_admin):
    root = await _create_category(client, as_admin, "Electronics")
    await _create_category(client, as_admin, "Mobile Phones", parent_id=root["id"])

    as_admin()
    resp = await client.delete(f"/admin/products/categories/{root['id']}")
    assert resp.status_code == 409

    # Still there afterwards.
    get_resp = await client.get(f"/products/categories/{root['id']}")
    assert get_resp.status_code == 200


async def test_delete_category_referenced_by_product_conflicts(client, as_admin, as_seller):
    category = await _create_category(client, as_admin, "Electronics")

    as_seller("42")
    product_resp = await client.post(
        "/products", json={"title": "Widget", "retail_price": "9.99", "category_id": category["id"], "attributes": {}}
    )
    assert product_resp.status_code == 201

    as_admin()
    resp = await client.delete(f"/admin/products/categories/{category['id']}")
    assert resp.status_code == 409


async def test_delete_leaf_empty_category_succeeds(client, as_admin):
    category = await _create_category(client, as_admin, "Electronics")

    as_admin()
    resp = await client.delete(f"/admin/products/categories/{category['id']}")
    assert resp.status_code == 204

    get_resp = await client.get(f"/products/categories/{category['id']}")
    assert get_resp.status_code == 404
