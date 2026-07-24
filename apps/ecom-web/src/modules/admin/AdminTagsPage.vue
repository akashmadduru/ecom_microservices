<template>
  <div class="space-y-6">
    <PageHeader eyebrow="Admin · Tags" title="Tags"
      description="Create, edit, or delete tags used on products.">
      <template #action>
        <router-link class="btn btn-primary btn-sm" to="/admin/tags/new">New tag</router-link>
      </template>
    </PageHeader>

    <DataTable :controller="controller" :columns="columns" empty-title="No tags yet"
      empty-description="Create a tag to get started.">
      <template #toolbar>
        <AdminTableToolbar :model-value="controller.search.value" search-placeholder="Search tags"
          :loading="controller.loading.value" @update:model-value="controller.setSearch" />
      </template>
      <template #actions="{ row }">
        <div class="flex justify-end gap-2">
          <router-link class="btn btn-ghost btn-xs" :to="`/admin/tags/${row.id}/edit`">Edit</router-link>
          <button class="btn btn-ghost btn-xs text-error" :disabled="tagStore.mutating"
            @click="askDelete(row)">Delete</button>
        </div>
      </template>
    </DataTable>

    <ConfirmDialog :open="confirmOpen" title="Delete tag"
      :message="`Delete &quot;${pendingDelete?.name ?? ''}&quot;? This cannot be undone.`" tone="danger"
      :loading="deleting" @confirm="confirmDelete" @cancel="cancelDelete"
      @update:open="(value) => value || cancelDelete()" />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useTagStore } from '@/stores/tag'
import PageHeader from '@/components/PageHeader.vue'
import DataTable from '@/components/admin/DataTable.vue'
import AdminTableToolbar from '@/components/admin/AdminTableToolbar.vue'
import ConfirmDialog from '@/components/admin/ConfirmDialog.vue'
import { useClientList } from '@/composables/useClientList'
import { useConfirmAction } from '@/composables/useConfirmAction'
import type { DataTableColumn } from '@/components/admin/dataTable.types'
import type { Tag } from '@/interfaces/tag'

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
