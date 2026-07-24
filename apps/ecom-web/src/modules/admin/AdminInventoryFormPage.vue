<template>
  <div class="space-y-6">
    <PageHeader eyebrow="Admin · New inventory record" title="Create inventory record"
      description="Register stock tracking for a product." />

    <div class="card">
      <div class="card-body">
        <form class="space-y-4" @submit.prevent="onSubmit" novalidate>
          <div v-if="formError.formError.value"
            class="alert-soft-error">
            {{ formError.formError.value }}
          </div>

          <div class="form-row-2">
            <label class="form-field">
              <span class="label-text">Product ID</span>
              <input v-model.number="form.product_id" type="number" min="1" class="input input-bordered" required
                :class="{ 'input-error': formError.fieldError('product_id') }" />
              <span v-if="formError.fieldError('product_id')" class="field-error">{{
                formError.fieldError('product_id') }}</span>
            </label>
            <label class="form-field">
              <span class="label-text">SKU</span>
              <input v-model="form.sku" class="input input-bordered" required
                :class="{ 'input-error': formError.fieldError('sku') }" />
              <span v-if="formError.fieldError('sku')" class="field-error">{{
                formError.fieldError('sku') }}</span>
            </label>
          </div>

          <label class="form-field">
            <span class="label-text">Warehouse location</span>
            <input v-model="form.warehouse_location" class="input input-bordered" required
              :class="{ 'input-error': formError.fieldError('warehouse_location') }" />
            <span v-if="formError.fieldError('warehouse_location')" class="field-error">{{
              formError.fieldError('warehouse_location') }}</span>
          </label>

          <div class="grid gap-4 md:grid-cols-3">
            <label class="form-field">
              <span class="label-text">Available quantity</span>
              <input v-model.number="form.available_quantity" type="number" min="0" class="input input-bordered"
                required :class="{ 'input-error': formError.fieldError('available_quantity') }" />
              <span v-if="formError.fieldError('available_quantity')" class="field-error">{{
                formError.fieldError('available_quantity') }}</span>
            </label>
            <label class="form-field">
              <span class="label-text">Safety stock</span>
              <input v-model.number="form.safety_stock" type="number" min="0" class="input input-bordered"
                required :class="{ 'input-error': formError.fieldError('safety_stock') }" />
              <span v-if="formError.fieldError('safety_stock')" class="field-error">{{
                formError.fieldError('safety_stock') }}</span>
            </label>
            <label class="form-field">
              <span class="label-text">Reorder threshold</span>
              <input v-model.number="form.reorder_threshold" type="number" min="0" class="input input-bordered"
                required :class="{ 'input-error': formError.fieldError('reorder_threshold') }" />
              <span v-if="formError.fieldError('reorder_threshold')" class="field-error">{{
                formError.fieldError('reorder_threshold') }}</span>
            </label>
          </div>

          <div class="flex gap-3">
            <button :class="['btn btn-primary', { 'opacity-70': submitting }]" type="submit" :disabled="submitting">
              {{ submitting ? 'Creating...' : 'Create record' }}
            </button>
            <router-link class="btn btn-outline" to="/admin/inventory">Cancel</router-link>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useInventoryStore } from '@/stores/inventory'
import { useEcommerceStore } from '@/stores/ecommerce'
import { useFormErrors } from '@/composables/useFormErrors'
import PageHeader from '@/components/PageHeader.vue'
import { inventorySchema } from '@/utils/validators'
import type { CreateInventoryPayload } from '@/interfaces/inventory'

const router = useRouter()
const inventoryStore = useInventoryStore()
const ecommerceStore = useEcommerceStore()
const formError = useFormErrors()
const submitting = ref(false)

const form = reactive<CreateInventoryPayload>({
  product_id: 0,
  sku: '',
  warehouse_location: 'DEFAULT',
  available_quantity: 0,
  safety_stock: 0,
  reorder_threshold: 0,
})

async function onSubmit() {
  formError.clear()
  if (!formError.validateForm(form, inventorySchema)) return
  submitting.value = true
  try {
    await inventoryStore.createInventory(form)
    ecommerceStore.showToast(`Inventory created for product #${form.product_id}.`, 'success')
    router.push('/admin/inventory')
  } catch (err) {
    const apiError = formError.setFromError(err)
    ecommerceStore.showToast(apiError.message, 'error', 'Create failed')
  } finally {
    submitting.value = false
  }
}
</script>
