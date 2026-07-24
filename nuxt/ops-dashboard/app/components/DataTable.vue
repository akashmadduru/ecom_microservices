<script setup lang="ts" generic="T">
/**
 * Minimal local table. Deliberately self-contained — this standalone project
 * imports nothing from vue/packages/lib.
 */
interface Column<Row> {
  key: string
  label: string
  /** Optional formatter; falls back to String(value). */
  format?: (row: Row) => string
}

const props = defineProps<{
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  emptyText?: string
}>()

const emit = defineEmits<{ (e: 'select', row: T): void }>()

function cellText(row: T, col: Column<T>): string {
  if (col.format) return col.format(row)
  const value = (row as Record<string, unknown>)[col.key]
  return value === null || value === undefined ? '—' : String(value)
}
</script>

<template>
  <table class="data-table">
    <thead>
      <tr>
        <th v-for="col in props.columns" :key="col.key">{{ col.label }}</th>
      </tr>
    </thead>
    <tbody>
      <tr
        v-for="row in props.rows"
        :key="props.rowKey(row)"
        class="data-table__row"
        @click="emit('select', row)"
      >
        <td v-for="col in props.columns" :key="col.key">
          <slot :name="`cell-${col.key}`" :row="row">{{ cellText(row, col) }}</slot>
        </td>
      </tr>
      <tr v-if="props.rows.length === 0">
        <td :colspan="props.columns.length" class="data-table__empty">
          {{ props.emptyText ?? 'No data.' }}
        </td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}
.data-table th,
.data-table td {
  text-align: left;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--border, #2a2f3a);
  white-space: nowrap;
}
.data-table th {
  color: var(--muted, #9aa4b2);
  font-weight: 600;
  text-transform: uppercase;
  font-size: 0.7rem;
  letter-spacing: 0.04em;
}
.data-table__row:hover {
  background: var(--row-hover, #1b2029);
  cursor: pointer;
}
.data-table__empty {
  color: var(--muted, #9aa4b2);
  text-align: center;
  padding: 1.5rem;
}
</style>
