<script setup lang="ts" generic="T">
import { computed } from 'vue'
import EmptyState from '@/components/EmptyState.vue'
import ErrorState from '@/components/ErrorState.vue'
import SkeletonTable from '@/components/SkeletonTable.vue'
import PaginationComponent from '@/components/PaginationComponent.vue'
import type { ListControllerResult } from '@/composables/listController.types'
import type { DataTableColumn } from './dataTable.types'

const props = withDefaults(
  defineProps<{
    controller: ListControllerResult<T>
    columns: DataTableColumn<T>[]
    rowKey?: keyof T | ((row: T) => string | number)
    emptyTitle?: string
    emptyDescription?: string
    dense?: boolean
  }>(),
  {
    rowKey: 'id' as keyof T,
    emptyTitle: 'Nothing here yet',
    emptyDescription: 'There are no records to display.',
    dense: false,
  },
)

const alignClass: Record<'left' | 'center' | 'right', string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
}

function getRowKey(row: T): string | number {
  if (typeof props.rowKey === 'function') return props.rowKey(row)
  return (row as Record<string, unknown>)[props.rowKey as string] as string | number
}

function cellValue(column: DataTableColumn<T>, row: T): unknown {
  if (column.accessor) return column.accessor(row)
  return (row as Record<string, unknown>)[column.key]
}

function cellClassFor(column: DataTableColumn<T>, row: T): string {
  if (typeof column.cellClass === 'function') return column.cellClass(row)
  return column.cellClass ?? ''
}

const showTable = computed(
  () => !['error', 'empty'].includes(props.controller.status.value),
)
const showSkeleton = computed(
  () => props.controller.status.value === 'loading' && props.controller.items.value.length === 0,
)
</script>

<template>
  <div class="space-y-4">
    <slot name="toolbar" />

    <SkeletonTable v-if="showSkeleton" :rows="controller.pageSize.value" />

    <ErrorState v-else-if="controller.status.value === 'error'" :message="controller.error.value ?? ''"
      :on-retry="() => controller.refresh()" />

    <template v-else-if="controller.status.value === 'empty'">
      <slot name="empty">
        <EmptyState :title="emptyTitle" :description="emptyDescription" />
      </slot>
    </template>

    <template v-else-if="showTable">
      <div class="data-panel">
        <table class="table" :class="{ 'table-sm': dense }">
          <thead>
            <tr>
              <th v-for="column in columns" :key="column.key" :style="column.width ? { width: column.width } : undefined"
                :class="alignClass[column.align ?? 'left']">
                {{ column.header }}
              </th>
              <th v-if="$slots.actions" class="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in controller.items.value" :key="getRowKey(row)"
              class="transition-colors hover:bg-base-200">
              <td v-for="column in columns" :key="column.key"
                :class="[alignClass[column.align ?? 'left'], cellClassFor(column, row)]">
                <slot :name="`cell:${column.key}`" :row="row" :value="cellValue(column, row)">
                  {{ cellValue(column, row) }}
                </slot>
              </td>
              <td v-if="$slots.actions" class="text-right">
                <slot name="actions" :row="row" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <PaginationComponent :pagination="controller.pagination.value" @change="controller.setPage" />
    </template>
  </div>
</template>
