export interface ApiError {
  message: string
  status: number | null
  fieldErrors: Record<string, string[]>
}
