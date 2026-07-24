<template>
  <div class="space-y-6">
    <PageHeader :eyebrow="isEdit ? 'Admin · Edit brand' : 'Admin · New brand'"
      :title="isEdit ? 'Edit brand' : 'Create a new brand'"
      description="Fields marked required must be filled before saving." />

    <div class="card">
      <div class="card-body">
        <SkeletonTable v-if="loadingExisting" :rows="6" />

        <form v-else class="space-y-4" @submit.prevent="onSubmit" novalidate>
          <div v-if="formError.formError.value"
            class="alert-soft-error">
            {{ formError.formError.value }}
          </div>

          <div class="form-row-2">
            <label class="form-field">
              <span class="label-text">Name</span>
              <input v-model="form.name" class="input input-bordered" required
                :class="{ 'input-error': formError.fieldError('name') }" />
              <span v-if="formError.fieldError('name')" class="field-error">{{
                formError.fieldError('name') }}</span>
            </label>
            <label class="form-field">
              <span class="label-text">Slug</span>
              <input v-model="form.slug" class="input input-bordered" required
                :class="{ 'input-error': formError.fieldError('slug') }" />
            </label>
          </div>

          <label class="form-field">
            <span class="label-text">Manufacturer</span>
            <select v-model="manufacturerIdValue" class="select select-bordered">
              <option :value="null">None</option>
              <option v-for="manufacturer in manufacturerStore.manufacturers" :key="manufacturer.id"
                :value="manufacturer.id">
                {{ manufacturer.name }}
              </option>
            </select>
          </label>

          <label class="form-field">
            <span class="label-text">Logo URL</span>
            <input v-model="form.logo_url" class="input input-bordered" />
          </label>

          <label class="form-field">
            <span class="label-text">Description</span>
            <textarea v-model="form.description" class="textarea textarea-bordered" rows="3" />
          </label>

          <label class="flex items-center gap-2">
            <input v-model="form.is_active" type="checkbox" class="checkbox" />
            <span class="label-text">Active</span>
          </label>

          <div class="flex gap-3">
            <button :class="['btn btn-primary', { 'opacity-70': submitting }]" type="submit"
              :disabled="submitting">
              {{ submitting ? 'Saving...' : isEdit ? 'Save changes' : 'Create brand' }}
            </button>
            <router-link class="btn btn-outline" to="/admin/brands">Cancel</router-link>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useBrandStore } from '@/stores/brand'
import { useManufacturerStore } from '@/stores/manufacturer'
import { useEcommerceStore } from '@/stores/ecommerce'
import { useFormErrors } from '@/composables/useFormErrors'
import PageHeader from '@/components/PageHeader.vue'
import SkeletonTable from '@/components/SkeletonTable.vue'
import { brandSchema } from '@/utils/validators'
import type { CreateBrandPayload } from '@/interfaces/brand'

const route = useRoute()
const router = useRouter()
const brandStore = useBrandStore()
const manufacturerStore = useManufacturerStore()
const ecommerceStore = useEcommerceStore()
const formError = useFormErrors()

const brandId = computed(() => (route.params.id ? Number(route.params.id) : null))
const isEdit = computed(() => brandId.value !== null)
const loadingExisting = ref(false)
const submitting = ref(false)

const manufacturerIdValue = ref<number | null>(null)

const form = reactive<CreateBrandPayload>({
  name: '',
  slug: '',
  logo_url: '',
  description: '',
  is_active: true,
})

async function onSubmit() {
  formError.clear()
  if (!formError.validateForm(form, brandSchema)) return
  submitting.value = true
  try {
    const payload: CreateBrandPayload = {
      name: form.name,
      slug: form.slug,
      logo_url: form.logo_url || undefined,
      manufacturer_id: manufacturerIdValue.value ?? undefined,
      description: form.description || undefined,
      is_active: form.is_active,
    }

    if (isEdit.value && brandId.value !== null) {
      await brandStore.updateBrand(brandId.value, payload)
      ecommerceStore.showToast(`Updated ${form.name}.`, 'success')
    } else {
      await brandStore.createBrand(payload)
      ecommerceStore.showToast(`Created ${form.name}.`, 'success')
    }
    router.push('/admin/brands')
  } catch (err) {
    const apiError = formError.setFromError(err)
    ecommerceStore.showToast(apiError.message, 'error', 'Save failed')
  } finally {
    submitting.value = false
  }
}

onMounted(async () => {
  manufacturerStore.fetchManufacturers()

  if (!isEdit.value || brandId.value === null) return

  loadingExisting.value = true
  try {
    await brandStore.fetchBrand(brandId.value)
    const existing = brandStore.selectedBrand
    if (existing) {
      form.name = existing.name
      form.slug = existing.slug
      form.logo_url = existing.logo_url ?? ''
      form.description = existing.description ?? ''
      form.is_active = existing.is_active
      manufacturerIdValue.value = existing.manufacturer_id ?? null
    }
  } catch {
    ecommerceStore.showToast('Failed to load brand.', 'error')
  } finally {
    loadingExisting.value = false
  }
})
</script>
