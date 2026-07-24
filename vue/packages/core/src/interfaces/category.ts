/**
 * Category as returned by `GET /products/categories` (and `/categories/{id}`).
 * Fields mirror the product-service Category schema documented in
 * `docs/v2/postman_collection.json`: clients send `{ name, parent_id?, sort_order? }`
 * on create and the server computes `slug`/`path`/`depth`; `is_active`/`sort_order`
 * are exposed on update. `children` is populated by the `/categories/{id}/subtree`
 * response ("the category and all its descendants") and is otherwise absent.
 */
export interface Category {
  id: number
  name: string
  slug: string
  parent_id?: number | null
  sort_order?: number
  path?: string
  depth?: number
  is_active?: boolean
  children?: Category[]
}
