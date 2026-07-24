<template>
  <article
    class="flex flex-col gap-4 justify-between cusror-pointer card group relative h-full overflow-hidden transition-all duration-300 ease-out">
    <button
      class="absolute right-4 top-4 z-20 rounded-full border border-black/10 bg-black/45 p-2 text-sm text-white transition-transform duration-300 hover:scale-105"
      @click.stop.prevent="toggleWishlist">
      {{ isWishlisted ? '♥' : '♡' }}
    </button>
    <AppImage :src="product.image_urls" alt=""
      img-class="h-44 w-full rounded-[1.1rem] rounded-b-none object-cover transition-all duration-500 ease-out" />
    <div class="card-body relative z-10 space-y-3">
      <div class="flex items-center justify-between gap-2">
        <span class="eyebrow-pill eyebrow-pill-sm">{{ product.category }}</span>
        <span class="text-xs text-muted">⭐ {{ product.rating }}</span>
      </div>
      <div class="space-y-1">
        <h2 class="text-lg font-semibold">{{ product.title }}</h2>
        <p class="text-sm text-muted line-clamp-2">{{ product.description }}</p>
      </div>
      <div class="flex items-center justify-between">
        <div>
          <div class="flex items-baseline gap-2">
            <p class="text-xl font-semibold">₹{{ sellingPrice.toFixed(2) }}</p>
            <p v-if="mrp !== null" class="text-xs text-subtle line-through">₹{{ mrp.toFixed(2) }}</p>
          </div>
          <p class="text-xs uppercase tracking-[0.24em] text-muted">{{ product.brand }}</p>
        </div>
        <button
          :class="['btn btn-primary btn-sm transition-all duration-300 hover:scale-[1.02]', { 'opacity-75': isProcessing }]"
          @click.stop.prevent="handleAddToCart">
          <span v-if="isProcessing">Adding...</span>
          <span v-else>+ Add</span>
        </button>
      </div>
      <div class="flex gap-2">
        <button class="btn btn-outline btn-sm flex-1 transition-all duration-300 hover:scale-[1.01]"
          @click.stop.prevent="viewProduct">Details</button>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import type { Product } from '@/interfaces/product'
import { useEcommerceStore } from '@/stores/ecommerce'
import AppImage from '@/components/AppImage.vue'
import { getSellingPrice, getMrp } from '@/utils/pricing'

const props = defineProps<{ product: Product }>()
const router = useRouter()
const ecommerceStore = useEcommerceStore()

const sellingPrice = computed(() => getSellingPrice(props.product))
const mrp = computed(() => getMrp(props.product))
const isWishlisted = computed(() => ecommerceStore.wishlist.some((item) => item.id === props.product.id))
const isProcessing = computed(() => ecommerceStore.isProcessing['p' + props.product.id] === true)

function viewProduct() {
  router.push(`/products/${props.product.id}`)
}

function handleAddToCart() {
  // optimistic UI: mark processing, add item locally, then clear
  ecommerceStore.isProcessing['p' + props.product.id] = true
  try {
    ecommerceStore.addToCart(props.product)
  } finally {
    setTimeout(() => (ecommerceStore.isProcessing['p' + props.product.id] = false), 300)
  }
}

function toggleWishlist() {
  ecommerceStore.toggleWishlist(props.product)
}
</script>
