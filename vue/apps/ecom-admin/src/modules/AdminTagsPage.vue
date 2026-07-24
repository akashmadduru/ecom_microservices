<template>
  <div class="space-y-6">
    <PageHeader
      eyebrow="Admin · Tags"
      title="Tags"
      description="Create, edit, or delete tags used on products."
    >
      <template #action>
        <router-link class="btn btn-primary btn-sm" to="/tags/new">New tag</router-link>
      </template>
    </PageHeader>

    <DataTable
      :controller="controller"
      :columns="columns"
      empty-title="No tags yet"
      empty-description="Create a tag to get started."
    >
      <template #toolbar>
        <TableToolbar
          :model-value="controller.search.value"
          search-placeholder="Search tags"
          :loading="controller.loading.value"
          @update:model-value="controller.setSearch"
        />
      </template>
      <template #actions="{ row }">
        <div class="flex justify-end gap-2">
          <router-link class="btn btn-ghost btn-xs" :to="`/tags/${row.id}/edit`">Edit</router-link>
          <button
            class="btn btn-ghost btn-xs text-error"
            :disabled="tagStore.mutating"
            @click="askDelete(row)"
          >
            Delete
          </button>
        </div>
      </template>
    </DataTable>

    <ConfirmDialog
      :open="confirmOpen"
      title="Delete tag"
      :message="`Delete &quot;${pendingDelete?.name ?? ''}&quot;? This cannot be undone.`"
      tone="danger"
      :loading="deleting"
      @confirm="confirmDelete"
      @cancel="cancelDelete"
      @update:open="(value) => value || cancelDelete()"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useTagStore } from 'core/stores/tag'
import PageHeader from 'lib/components/PageHeader.vue'
import DataTable from 'lib/widgets/DataTable.vue'
import TableToolbar from 'lib/widgets/TableToolbar.vue'
import ConfirmDialog from 'lib/widgets/ConfirmDialog.vue'
import { useClientList } from 'core/composables/useClientList'
import { useConfirmAction } from 'core/composables/useConfirmAction'
import type { DataTableColumn } from 'lib/widgets/dataTable.types'
import type { Tag } from 'core/interfaces/tag'

const tagStore = useTagStore()

const { tags, loading, error } = storeToRefs(tagStore)

const columns: DataTableColumn<Tag>[] = [
  { key: 'name', header: 'Name', cellClass: 'font-semibold text-base-content' },
  { key: 'slug', header: 'Slug' },
]

const controller = useClientList<Tag>({
  source: tags,
  searchFields: ['name', 'slug'],
  initialPageSize: 10,
  loading,
  error,
  onRefresh: () => tagStore.fetchTags(),
})

function clampPage(): void {
  const totalPages = controller.pagination.value.total_pages
  if (controller.page.value > totalPages) controller.setPage(totalPages)
}

const {
  pendingDelete,
  confirmOpen,
  deleting,
  ask: askDelete,
  cancel: cancelDelete,
  confirm: confirmDelete,
} = useConfirmAction<Tag>({
  perform: async (tag) => {
    await tagStore.deleteTag(tag.id)
  },
  label: (tag) => tag.name,
  onSuccess: () => clampPage(),
  errorMessage: () => tagStore.error ?? 'Failed to delete tag.',
})

onMounted(() => {
  tagStore.fetchTags()
})
</script>
