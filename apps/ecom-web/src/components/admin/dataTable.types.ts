export interface DataTableColumn<T> {
  key: string
  header: string
  align?: 'left' | 'center' | 'right'
  width?: string
  cellClass?: string | ((row: T) => string)
  accessor?: (row: T) => unknown
}
