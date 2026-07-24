export interface Tag {
  id: number
  name: string
  slug: string
}

export interface CreateTagPayload {
  name: string
  slug: string
}

export type UpdateTagPayload = Partial<CreateTagPayload>
