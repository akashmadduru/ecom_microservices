<template>
  <div class="space-y-6">
    <PageHeader :eyebrow="isEdit ? 'Admin · Edit tag' : 'Admin · New tag'"
      :title="isEdit ? 'Edit tag' : 'Create a new tag'"
      description="Fields marked required must be filled before saving." />

    <div class="card">
      <div class="card-body">
        <SkeletonTable v-if="loadingExisting" :rows="3" />

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
              <span v-if="formError.fieldError('slug')" class="field-error">{{
                formError.fieldError('slug') }}</span>
            </label>
          </div>

          <div class="flex gap-3">
            <button :class="['btn btn-primary', { 'opacity-70': submitting }]" type="submit"
              :disabled="submitting">
              {{ submitting ? 'Saving...' : isEdit ? 'Save changes' : 'Create tag' }}
            </button>
            <router-link class="btn btn-outline" to="/admin/tags">Cancel</router-link>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTagStore } from '@/stores/tag'
import { useEcommerceStore } from '@/stores/ecommerce'
import { useFormErrors } from '@/composables/useFormErrors'
import PageHeader from '@/components/PageHeader.vue'
import SkeletonTable from '@/components/SkeletonTable.vue'
import { tagSchema } from '@/utils/validators'
import type { CreateTagPayload } from '@/interfaces/tag'

const route = useRoute()
const router = useRouter()
const tagStore = useTagStore()
const ecommerceStore = useEcommerceStore()
const formError = useFormErrors()

const tagId = computed(() => (route.params.id ? Number(route.params.id) : null))
const isEdit = computed(() => tagId.value !== null)
const loadingExisting = ref(false)
const submitting = ref(false)

const form = reactive<CreateTagPayload>({
  name: '',
  slug: '',
})

async function onSubmit() {
  formError.clear()
  if (!formError.validateForm(form, tagSchema)) return
  submitting.value = true
  try {
    const payload: CreateTagPayload = {
      name: form.name,
      slug: form.slug,
    }

    if (isEdit.value && tagId.value !== null) {
      await tagStore.updateTag(tagId.value, payload)
      ecommerceStore.showToast(`Updated ${form.name}.`, 'success')
    } else {
      await tagStore.createTag(payload)
      ecommerceStore.showToast(`Created ${form.name}.`, 'success')
    }
    router.push('/admin/tags')
  } catch (err) {
    const apiError = formError.setFromError(err)
    ecommerceStore.showToast(apiError.message, 'error', 'Save failed')
  } finally {
    submitting.value = false
  }
}

onMounted(async () => {
  if (!isEdit.value || tagId.value === null) return

  loadingExisting.value = true
  try {
    await tagStore.fetchTag(tagId.value)
    const existing = tagStore.selectedTag
    if (existing) {
      form.name = existing.name
      form.slug = existing.slug
    }
  } catch {
    ecommerceStore.showToast('Failed to load tag.', 'error')
  } finally {
    loadingExisting.value = false
  }
})
</script>
