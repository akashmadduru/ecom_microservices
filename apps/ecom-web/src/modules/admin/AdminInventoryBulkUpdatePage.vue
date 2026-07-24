<template>
  <div class="space-y-6">
    <PageHeader eyebrow="Admin · Inventory" title="Bulk update reorder thresholds"
      description="Update reorder thresholds for multiple products in one request." />

    <div class="card">
      <div class="card-body space-y-4">
        <div v-if="formError.formError.value"
          class="alert-soft-error">
          {{ formError.formError.value }}
        </div>

        <div v-for="(item, index) in items" :key="index" class="flex flex-wrap items-end gap-3">
          <label class="form-field">
            <span class="label-text">Product ID</span>
            <input v-model.number="item.product_id" type="number" min="1" class="input input-bordered input-sm" />
          </label>
          <label class="form-field">
            <span class="label-text">Reorder threshold</span>
            <input v-model.number="item.reorder_threshold" type="number" min="0"
              class="input input-bordered input-sm" />
          </label>
          <label class="form-field">
            <span class="label-text">Safety stock</span>
            <input v-model.number="item.safety_stock" type="number" min="0" class="input input-bordered input-sm" />
          </label>
          <label class="form-field">
            <span class="label-text">Warehouse location</span>
            <input v-model="item.warehouse_location" class="input input-bordered input-sm" />
          </label>
          <button class="btn btn-ghost btn-sm text-error" :disabled="items.length === 1"
            @click="items.splice(index, 1)">Remove</button>
        </div>

        <button class="btn btn-outline btn-sm"
          @click="items.push({ product_id: 0, reorder_threshold: 0, safety_stock: 0, warehouse_location: '' })">
          + Add row
        </button>

        <div class="flex gap-3 pt-2">
          <button :class="['btn btn-primary', { 'opacity-70': submitting }]" :disabled="submitting"
            @click="onSubmit">
            {{ submitting ? 'Applying...' : 'Apply bulk update' }}
          </button>
          <router-link class="btn btn-outline" to="/admin/inventory">Back to inventory</router-link>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useInventoryStore } from '@/stores/inventory'
import { useEcommerceStore } from '@/stores/ecommerce'
import { useFormErrors } from '@/composables/useFormErrors'
import PageHeader from '@/components/PageHeader.vue'
import type { BulkUpdateItem } from '@/interfaces/inventory'

const inventoryStore = useInventoryStore()
const ecommerceStore = useEcommerceStore()
const formError = useFormErrors()
const submitting = ref(false)

const items = reactive<BulkUpdateItem[]>([
  { product_id: 0, reorder_threshold: 0, safety_stock: 0, warehouse_location: '' },
])

async function onSubmit() {
  formError.clear()
  const validItems = items
    .filter((item) => item.product_id > 0)
    .map((item) => ({
      product_id: item.product_id,
      reorder_threshold: item.reorder_threshold,
      safety_stock: item.safety_stock,
      warehouse_location: item.warehouse_location?.trim() || undefined,
    }))
  if (!validItems.length) {
    ecommerceStore.showToast('Add at least one valid product ID.', 'warning')
    return
  }

  submitting.value = true
  try {
    await inventoryStore.bulkUpdate({ items: validItems })
    ecommerceStore.showToast(`Updated ${validItems.length} inventory record(s).`, 'success')
  } catch (err) {
    const apiError = formError.setFromError(err)
    ecommerceStore.showToast(apiError.message, 'error', 'Bulk update failed')
  } finally {
    submitting.value = false
  }
}
</script>
