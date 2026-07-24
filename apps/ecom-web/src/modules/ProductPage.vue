<template>
  <div v-if="productStore.selectedProduct" class="min-h-screen px-4 py-10 text-base-content">
    <div class="mx-auto max-w-6xl space-y-6">
      <nav aria-label="Breadcrumb" class="text-sm text-muted">
        <ol class="flex flex-wrap items-center gap-2">
          <li><router-link to="/products" class="hover:text-base-content">Products</router-link></li>
          <li class="text-base-content/40">/</li>
          <li>{{ productStore.selectedProduct.category }}</li>
          <li class="text-base-content/40">/</li>
          <li class="line-clamp-1 font-semibold text-base-content">{{ productStore.selectedProduct.title }}</li>
        </ol>
      </nav>

      <div class="grid gap-8 lg:grid-cols-[1fr_1fr]">
        <div class="space-y-4">
          <div class="card">
            <figure class="p-4">
              <AppImage :src="images[activeImage]" alt="" :raw="false" img-class="h-80 w-full rounded-xl object-cover" />
            </figure>
          </div>
          <div class="flex flex-wrap gap-3">
            <button v-for="(image, index) in images" :key="image" class="h-20 w-20 overflow-hidden rounded-lg border-2"
              :class="activeImage === index ? 'border-primary' : 'border-transparent'" @click="activeImage = index">
              <AppImage :src="image" alt="" :raw="false" img-class="h-full w-full object-cover" />
            </button>
          </div>
        </div>

        <div class="card">
          <div class="card-body space-y-4">
            <div class="space-y-2">
              <p class="section-kicker section-kicker-sm">{{ productStore.selectedProduct.category }}</p>
              <h1 class="line-clamp-3 text-3xl font-semibold">{{ productStore.selectedProduct.title }}</h1>
              <p class="text-sm text-muted">{{ productStore.selectedProduct.description }}</p>
            </div>

            <div class="flex flex-wrap items-baseline gap-3">
              <span class="text-3xl font-semibold">₹{{ sellingPrice.toFixed(2) }}</span>
              <span v-if="discountApplies" class="text-lg text-subtle line-through">₹{{ (mrp ?? 0).toFixed(2) }}</span>
              <span v-if="discountApplies" class="badge badge-success">{{ discountPercent }}% off</span>
            </div>

            <div class="flex flex-wrap items-center gap-2 text-sm text-muted">
              <span class="badge badge-outline">⭐ {{ productStore.selectedProduct.rating }}</span>
              <span>Brand: {{ productStore.selectedProduct.brand }}</span>
              <span v-if="stockBadge" class="badge" :class="stockBadge.class">{{ stockBadge.label }}</span>
            </div>

            <div v-if="inventoryStore.selected" class="flex flex-wrap items-center gap-2 text-sm text-muted">
              <span>SKU: {{ inventoryStore.selected.sku }}</span>
              <span class="text-base-content/40">•</span>
              <span>{{ inventoryStore.selected.available_quantity }} available</span>
            </div>

            <div v-if="manufacturerStore.selectedManufacturer" class="space-y-1 rounded-lg bg-base-200 p-4">
              <p class="font-semibold">Manufacturer</p>
              <p class="text-sm text-muted">{{ manufacturerStore.selectedManufacturer.name }}</p>
              <p v-if="manufacturerStore.selectedManufacturer.country_of_origin" class="text-sm text-muted">
                Country of origin: {{ manufacturerStore.selectedManufacturer.country_of_origin }}
              </p>
            </div>

            <div class="space-y-2 rounded-lg bg-base-200 p-4">
              <p class="font-semibold">Specifications</p>
              <table v-if="hasAttributes" class="w-full text-sm text-muted">
                <tbody>
                  <tr v-for="(value, key) in productStore.selectedProduct.attributes" :key="key"
                    class="border-b border-base-300 last:border-0">
                    <td class="py-1 pr-4 font-medium text-base-content">{{ key }}</td>
                    <td class="py-1">{{ value }}</td>
                  </tr>
                </tbody>
              </table>
              <p v-else class="text-sm text-muted">No additional specifications</p>
            </div>

            <div class="space-y-2 rounded-lg bg-base-200 p-4">
              <p class="font-semibold">Why you’ll love it</p>
              <ul class="list-disc space-y-1 pl-5 text-sm text-muted">
                <li>Ready for everyday use and travel</li>
                <li>Comfortable design with premium finish</li>
                <li>Backed by a simple mock checkout flow</li>
              </ul>
            </div>

            <div class="flex flex-wrap gap-3">
              <button class="btn btn-primary" @click="addToCart" :class="{ 'opacity-70': isProcessing }">{{ isProcessing ?
                'Adding...' : 'Add to cart' }}</button>
              <button class="btn btn-outline" @click="toggleWishlist">{{ isWishlisted ? 'Saved' : 'Save wishlist'
              }}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useProductStore } from '@/stores/product'
import { useEcommerceStore } from '@/stores/ecommerce'
import { useInventoryStore } from '@/stores/inventory'
import { useManufacturerStore } from '@/stores/manufacturer'
import AppImage from '@/components/AppImage.vue'
import { getSellingPrice, getMrp, getDiscountPercent, hasDiscount } from '@/utils/pricing'

const route = useRoute()
const productStore = useProductStore()
const ecommerceStore = useEcommerceStore()
const inventoryStore = useInventoryStore()
const manufacturerStore = useManufacturerStore()
const activeImage = ref(0)

const stockBadge = computed(() => {
  const record = inventoryStore.selected
  if (!record) return null
  if (record.available_quantity <= 0) return { label: 'Out of stock', class: 'badge-error' }
  if (record.status === 'LOW_STOCK') return { label: `Only ${record.available_quantity} left`, class: 'badge-warning' }
  return { label: 'In stock', class: 'badge-success' }
})

const images = computed(() => productStore.selectedProductImageList)

const discountApplies = computed(() =>
  productStore.selectedProduct ? hasDiscount(productStore.selectedProduct) : false,
)
const sellingPrice = computed(() =>
  productStore.selectedProduct ? getSellingPrice(productStore.selectedProduct) : 0,
)
const mrp = computed(() => (productStore.selectedProduct ? getMrp(productStore.selectedProduct) : null))
const discountPercent = computed(() =>
  productStore.selectedProduct ? getDiscountPercent(productStore.selectedProduct) : null,
)

const hasAttributes = computed(() => {
  const attributes = productStore.selectedProduct?.attributes
  return !!attributes && Object.keys(attributes).length > 0
})

const isProcessing = computed(() => {
  const id = productStore.selectedProduct?.id
  return id ? ecommerceStore.isProcessing['p' + id] === true : false
})

const isWishlisted = computed(() => {
  const id = productStore.selectedProduct?.id
  return id ? ecommerceStore.wishlist.some((w) => w.id === id) : false
})

function addToCart() {
  const p = productStore.selectedProduct
  if (!p) return
  ecommerceStore.isProcessing['p' + p.id] = true
  try {
    ecommerceStore.addToCart(p)
  } finally {
    setTimeout(() => (ecommerceStore.isProcessing['p' + p.id] = false), 300)
  }
}

function toggleWishlist() {
  const p = productStore.selectedProduct
  if (!p) return
  ecommerceStore.toggleWishlist(p)
}

onMounted(async () => {
  const id = Number(route.params.id)
  await productStore.fetchProduct(id).catch(() => {
    // error state already reflected via productStore.error
  })

  const manufacturerId = productStore.selectedProduct?.manufacturer_id
  if (manufacturerId) {
    manufacturerStore.fetchManufacturer(manufacturerId).catch(() => {
      // manufacturer block is a nice-to-have; ignore if it fails to load
    })
  }

  inventoryStore.fetchByProduct(id).catch(() => {
    // stock badge is a nice-to-have; ignore if no inventory record exists yet
  })
})
</script>
