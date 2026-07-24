<template>
  <div class="space-y-6">
    <PageHeader :eyebrow="isEdit ? 'Admin · Edit product' : 'Admin · New product'"
      :title="isEdit ? 'Edit product' : 'Create a new product'"
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
              <span class="label-text">Title</span>
              <input v-model="form.title" class="input input-bordered" required
                :class="{ 'input-error': formError.fieldError('title') }" />
              <span v-if="formError.fieldError('title')" class="field-error">{{
                formError.fieldError('title') }}</span>
            </label>
            <label class="form-field">
              <span class="label-text">Slug</span>
              <input v-model="form.slug" class="input input-bordered"
                :class="{ 'input-error': formError.fieldError('slug') }" />
            </label>
          </div>

          <div class="form-row-2">
            <label class="form-field">
              <span class="label-text">Brand</span>
              <input v-model="form.brand" class="input input-bordered" required
                :class="{ 'input-error': formError.fieldError('brand') }" />
            </label>
            <label class="form-field">
              <span class="label-text">Brand (linked)</span>
              <select v-model="brandIdValue" class="select select-bordered">
                <option :value="null">None</option>
                <option v-for="brand in brandStore.brands" :key="brand.id" :value="brand.id">
                  {{ brand.name }}
                </option>
              </select>
            </label>
          </div>

          <div class="form-row-2">
            <label class="form-field">
              <span class="label-text">Category</span>
              <input v-model="form.category" class="input input-bordered" required />
            </label>
            <label class="form-field">
              <span class="label-text">Sub-category</span>
              <input v-model="form.sub_category" class="input input-bordered" required />
            </label>
          </div>

          <div class="form-row-2">
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
              <span class="label-text">Category ID (picker coming once Categories ship)</span>
              <input v-model.number="categoryIdValue" type="number" min="1" class="input input-bordered" />
            </label>
          </div>

          <div class="form-row-2">
            <label class="form-field">
              <span class="label-text">Retail price</span>
              <input v-model.number="form.retail_price" type="number" min="0" step="0.01"
                class="input input-bordered" required
                :class="{ 'input-error': formError.fieldError('retail_price') }" />
            </label>
            <label class="form-field">
              <span class="label-text">Discount (%)</span>
              <input v-model.number="form.discount" type="number" min="0" max="100" step="0.01"
                class="input input-bordered" required />
            </label>
          </div>

          <div class="form-row-2">
            <label class="form-field">
              <span class="label-text">Product URL</span>
              <input v-model="form.product_url" class="input input-bordered" />
            </label>
            <label v-if="!isEdit" class="form-field">
              <span class="label-text">Unique ID</span>
              <input v-model="form.uniq_id" class="input input-bordered" />
            </label>
          </div>

          <label class="form-field">
            <span class="label-text">Image URLs</span>
            <textarea v-model="form.image_urls" class="textarea textarea-bordered" rows="2"
              placeholder='["https://example.com/1.jpg","https://example.com/2.jpg"]' />
            <span class="text-xs text-subtle">JSON array of image URLs.</span>
          </label>

          <label class="form-field">
            <span class="label-text">Description</span>
            <textarea v-model="form.description" class="textarea textarea-bordered" rows="4" required />
          </label>

          <div class="form-row-2">
            <label class="form-field">
              <span class="label-text">SEO title</span>
              <input v-model="form.seo_title" class="input input-bordered" />
            </label>
            <label class="form-field">
              <span class="label-text">Canonical URL</span>
              <input v-model="form.canonical_url" class="input input-bordered" />
            </label>
          </div>

          <label class="form-field">
            <span class="label-text">SEO description</span>
            <textarea v-model="form.seo_description" class="textarea textarea-bordered" rows="2" />
          </label>

          <label class="form-field">
            <span class="label-text">Meta keywords</span>
            <input v-model="metaKeywordsInput" class="input input-bordered" placeholder="racing wheel, gaming accessories" />
            <span class="text-xs text-subtle">Comma-separated values.</span>
          </label>

          <div class="flex gap-3">
            <button :class="['btn btn-primary', { 'opacity-70': submitting }]" type="submit"
              :disabled="submitting">
              {{ submitting ? 'Saving...' : isEdit ? 'Save changes' : 'Create product' }}
            </button>
            <router-link class="btn btn-outline" to="/admin/products">Cancel</router-link>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useProductStore } from '@/stores/product'
import { useBrandStore } from '@/stores/brand'
import { useManufacturerStore } from '@/stores/manufacturer'
import { useEcommerceStore } from '@/stores/ecommerce'
import { useFormErrors } from '@/composables/useFormErrors'
import PageHeader from '@/components/PageHeader.vue'
import SkeletonTable from '@/components/SkeletonTable.vue'
import { productSchema } from '@/utils/validators'
import type { CreateProductPayload } from '@/interfaces/product'

const route = useRoute()
const router = useRouter()
const productStore = useProductStore()
const brandStore = useBrandStore()
const manufacturerStore = useManufacturerStore()
const ecommerceStore = useEcommerceStore()
const formError = useFormErrors()

const productId = computed(() => (route.params.id ? Number(route.params.id) : null))
const isEdit = computed(() => productId.value !== null)
const loadingExisting = ref(false)
const submitting = ref(false)

const brandIdValue = ref<number | null>(null)
const manufacturerIdValue = ref<number | null>(null)
const categoryIdValue = ref<number | null>(null)
const metaKeywordsInput = ref('')

const form = reactive<CreateProductPayload>({
  title: '',
  retail_price: 0,
  discount: 0,
  category: '',
  sub_category: '',
  brand: '',
  description: '',
  uniq_id: '',
  product_url: '',
  image_urls: '',
  slug: '',
  seo_title: '',
  seo_description: '',
  canonical_url: '',
})

function parseMetaKeywords(input: string): string[] | undefined {
  const keywords = input
    .split(',')
    .map((keyword) => keyword.trim())
    .filter(Boolean)
  return keywords.length ? keywords : undefined
}

function buildPayload(): CreateProductPayload {
  return {
    title: form.title,
    retail_price: form.retail_price,
    discount: form.discount,
    category: form.category,
    sub_category: form.sub_category,
    brand: form.brand,
    description: form.description,
    product_url: form.product_url,
    image_urls: form.image_urls,
    slug: form.slug || undefined,
    brand_id: brandIdValue.value ?? undefined,
    manufacturer_id: manufacturerIdValue.value ?? undefined,
    category_id: categoryIdValue.value ?? undefined,
    seo_title: form.seo_title || undefined,
    seo_description: form.seo_description || undefined,
    canonical_url: form.canonical_url || undefined,
    meta_keywords: parseMetaKeywords(metaKeywordsInput.value),
  }
}

async function onSubmit() {
  formError.clear()
  if (!formError.validateForm(form, productSchema)) return
  submitting.value = true
  try {
    if (isEdit.value && productId.value !== null) {
      await productStore.updateProduct(productId.value, buildPayload())
      ecommerceStore.showToast(`Updated ${form.title}.`, 'success')
    } else {
      await productStore.createProduct({ ...buildPayload(), uniq_id: form.uniq_id })
      ecommerceStore.showToast(`Created ${form.title}.`, 'success')
    }
    router.push('/admin/products')
  } catch (err) {
    const apiError = formError.setFromError(err)
    ecommerceStore.showToast(apiError.message, 'error', 'Save failed')
  } finally {
    submitting.value = false
  }
}

onMounted(async () => {
  brandStore.fetchBrands()
  manufacturerStore.fetchManufacturers()

  if (!isEdit.value || productId.value === null) return

  loadingExisting.value = true
  try {
    await productStore.fetchProduct(productId.value)
    const existing = productStore.selectedProduct
    if (existing) {
      form.title = existing.title
      form.retail_price = existing.retail_price
      form.discount = existing.discount
      form.category = existing.category
      form.sub_category = existing.sub_category
      form.brand = existing.brand
      form.description = existing.description
      form.product_url = existing.product_url
      form.image_urls = existing.image_urls
      form.slug = existing.slug ?? ''
      form.seo_title = existing.seo_title ?? ''
      form.seo_description = existing.seo_description ?? ''
      form.canonical_url = existing.canonical_url ?? ''
      brandIdValue.value = existing.brand_id ?? null
      manufacturerIdValue.value = existing.manufacturer_id ?? null
      categoryIdValue.value = existing.category_id ?? null
      metaKeywordsInput.value = existing.meta_keywords?.join(', ') ?? ''
    }
  } catch {
    ecommerceStore.showToast('Failed to load product.', 'error')
  } finally {
    loadingExisting.value = false
  }
})
</script>
