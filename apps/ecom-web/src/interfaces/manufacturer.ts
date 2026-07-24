export interface ManufacturerContactInfo {
  email?: string
  phone?: string
  [key: string]: string | undefined
}

export interface Manufacturer {
  id: number
  name: string
  country_of_origin?: string
  contact_info?: ManufacturerContactInfo
}

export interface CreateManufacturerPayload {
  name: string
  country_of_origin?: string
  contact_info?: ManufacturerContactInfo
}

export type UpdateManufacturerPayload = Partial<CreateManufacturerPayload>
