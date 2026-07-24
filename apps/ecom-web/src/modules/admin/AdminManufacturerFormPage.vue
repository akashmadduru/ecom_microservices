<template>
  <div class="space-y-6">
    <PageHeader :eyebrow="isEdit ? 'Admin · Edit manufacturer' : 'Admin · New manufacturer'"
      :title="isEdit ? 'Edit manufacturer' : 'Create a new manufacturer'"
      description="Fields marked required must be filled before saving." />

    <div class="card">
      <div class="card-body">
        <SkeletonTable v-if="loadingExisting" :rows="4" />

        <form v-else class="space-y-4" @submit.prevent="onSubmit" novalidate>
          <div v-if="formError.formError.value"
            class="alert-soft-error">
            {{ formError.formError.value }}
          </div>

          <label class="form-field">
            <span class="label-text">Name</span>
            <input v-model="form.name" class="input input-bordered" required
              :class="{ 'input-error': formError.fieldError('name') }" />
            <span v-if="formError.fieldError('name')" class="field-error">{{
              formError.fieldError('name') }}</span>
          </label>

          <label class="form-field">
            <span class="label-text">Country of origin (2-letter code)</span>
            <input v-model="form.country_of_origin" class="input input-bordered" maxlength="2" placeholder="IN" />
          </label>

          <div class="form-row-2">
            <label class="form-field">
              <span class="label-text">Contact email</span>
              <input v-model="contactEmail" type="email" class="input input-bordered"
                :class="{ 'input-error': contactEmailError }" />
              <span v-if="contactEmailError" class="field-error">{{ contactEmailError }}</span>
            </label>
            <label class="form-field">
              <span class="label-text">Contact phone</span>
              <input v-model="contactPhone" class="input input-bordered" />
            </label>
          </div>

          <div class="flex gap-3">
            <button :class="['btn btn-primary', { 'opacity-70': submitting }]" type="submit"
              :disabled="submitting">
              {{ submitting ? 'Saving...' : isEdit ? 'Save changes' : 'Create manufacturer' }}
            </button>
            <router-link class="btn btn-outline" to="/admin/manufacturers">Cancel</router-link>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useManufacturerStore } from '@/stores/manufacturer'
import { useEcommerceStore } from '@/stores/ecommerce'
import { useFormErrors } from '@/composables/useFormErrors'
import PageHeader from '@/components/PageHeader.vue'
import SkeletonTable from '@/components/SkeletonTable.vue'
import { emailRule, manufacturerSchema } from '@/utils/validators'
import type { CreateManufacturerPayload } from '@/interfaces/manufacturer'

const route = useRoute()
const router = useRouter()
const manufacturerStore = useManufacturerStore()
const ecommerceStore = useEcommerceStore()
const formError = useFormErrors()

const manufacturerId = computed(() => (route.params.id ? Number(route.params.id) : null))
const isEdit = computed(() => manufacturerId.value !== null)
const loadingExisting = ref(false)
const submitting = ref(false)

const contactEmail = ref('')
const contactPhone = ref('')
const contactEmailError = ref<string | null>(null)

const validateContactEmail = emailRule('Enter a valid email address.')

const form = reactive<CreateManufacturerPayload>({
  name: '',
  country_of_origin: '',
})

function buildContactInfo(): CreateManufacturerPayload['contact_info'] | undefined {
  if (!contactEmail.value && !contactPhone.value) return undefined
  return {
    ...(contactEmail.value ? { email: contactEmail.value } : {}),
    ...(contactPhone.value ? { phone: contactPhone.value } : {}),
  }
}

async function onSubmit() {
  formError.clear()
  contactEmailError.value = validateContactEmail(contactEmail.value || undefined, {})
  const formValid = formError.validateForm(form, manufacturerSchema)
  if (!formValid || contactEmailError.value) return
  submitting.value = true
  try {
    const payload: CreateManufacturerPayload = {
      name: form.name,
      country_of_origin: form.country_of_origin || undefined,
      contact_info: buildContactInfo(),
    }

    if (isEdit.value && manufacturerId.value !== null) {
      await manufacturerStore.updateManufacturer(manufacturerId.value, payload)
      ecommerceStore.showToast(`Updated ${form.name}.`, 'success')
    } else {
      await manufacturerStore.createManufacturer(payload)
      ecommerceStore.showToast(`Created ${form.name}.`, 'success')
    }
    router.push('/admin/manufacturers')
  } catch (err) {
    const apiError = formError.setFromError(err)
    ecommerceStore.showToast(apiError.message, 'error', 'Save failed')
  } finally {
    submitting.value = false
  }
}

onMounted(async () => {
  if (!isEdit.value || manufacturerId.value === null) return

  loadingExisting.value = true
  try {
    await manufacturerStore.fetchManufacturer(manufacturerId.value)
    const existing = manufacturerStore.selectedManufacturer
    if (existing) {
      form.name = existing.name
      form.country_of_origin = existing.country_of_origin ?? ''
      contactEmail.value = existing.contact_info?.email ?? ''
      contactPhone.value = existing.contact_info?.phone ?? ''
    }
  } catch {
    ecommerceStore.showToast('Failed to load manufacturer.', 'error')
  } finally {
    loadingExisting.value = false
  }
})
</script>
