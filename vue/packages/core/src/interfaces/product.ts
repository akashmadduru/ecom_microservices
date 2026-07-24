export interface Product {
  id: number
  uniq_id: string
  created_at?: string
  crawl_timestamp?: string
  product_url: string
  title: string
  slug?: string
  retail_price: number
  discount: number
  image_urls: string
  description: string
  category: string
  sub_category: string
  rating: number
  brand: string
  brand_id?: number
  manufacturer_id?: number
  category_id?: number
  seo_title?: string
  seo_description?: string
  canonical_url?: string
  meta_keywords?: string[]
  attributes?: Record<string, string>
}

export interface CreateProductPayload {
  title: string
  retail_price: number
  discount: number
  category: string
  sub_category: string
  brand: string
  description: string
  uniq_id?: string
  product_url?: string
  image_urls?: string
  slug?: string
  brand_id?: number
  manufacturer_id?: number
  category_id?: number
  seo_title?: string
  seo_description?: string
  canonical_url?: string
  meta_keywords?: string[]
  attributes?: Record<string, string>
}

export type UpdateProductPayload = Partial<CreateProductPayload>

export interface ProductFilterParams {
  category?: string
  brand?: string
  brand_id?: number
  category_id?: number
  min_price?: number
  max_price?: number
  min_rating?: number
  sort?: string
}
