export interface Pagination {
  page: number
  page_size: number
  total_items: number
  total_pages: number
  has_previous: boolean
  has_next: boolean
  previous_page: number | null
  next_page: number | null
}
