export interface Brand {
  id: number
  name: string
  slug: string
  logo_url?: string
  manufacturer_id?: number
  description?: string
  is_active: boolean
}

export interface CreateBrandPayload {
  name: string
  slug: string
  logo_url?: string
  manufacturer_id?: number
  description?: string
  is_active?: boolean
}

export type UpdateBrandPayload = Partial<CreateBrandPayload>
