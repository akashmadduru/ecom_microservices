import type { Pagination } from '@/interfaces/pagination'

export function buildPagination(page: number, pageSize: number, totalItems: number): Pagination {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))

  return {
    page,
    page_size: pageSize,
    total_items: totalItems,
    total_pages: totalPages,
    has_previous: page > 1,
    has_next: page < totalPages,
    previous_page: page > 1 ? page - 1 : null,
    next_page: page < totalPages ? page + 1 : null,
  }
}
