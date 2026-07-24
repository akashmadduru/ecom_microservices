<template>
  <div class="min-h-screen px-4 py-10 text-base-content">
    <div class="mx-auto max-w-6xl space-y-6">
      <PageHeader eyebrow="Wishlist" title="Saved for later"
        description="Keep a curated list of favorites ready for your next purchase." />

      <div v-if="ecommerceStore.wishlist.length" class="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <div v-for="item in ecommerceStore.wishlist" :key="item.id"
          class="card">
          <figure>
            <AppImage :src="item.image_urls" alt="" img-class="h-48 w-full rounded-[1.1rem] object-cover" />
          </figure>
          <div class="card-body">
            <h2 class="card-title text-base-content">{{ item.title }}</h2>
            <p class="text-sm text-muted">{{ item.brand }} • {{ item.category }}</p>
            <p class="text-lg font-semibold text-base-content">₹{{ item.retail_price }}</p>
            <div class="card-actions justify-between">
              <button class="btn btn-primary btn-sm" @click="addToCart(item)">Add to cart</button>
              <button class="btn btn-ghost btn-sm" @click="ecommerceStore.removeFromWishlist(item.id)">Remove</button>
            </div>
          </div>
        </div>
      </div>

      <EmptyState v-else title="Nothing saved yet"
        description="Tap the heart on any product to build your wishlist." />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import PageHeader from '@/components/PageHeader.vue'
import AppImage from '@/components/AppImage.vue'
import EmptyState from '@/components/EmptyState.vue'
import { useEcommerceStore } from '@/stores/ecommerce'

const ecommerceStore = useEcommerceStore()

function addToCart(item: { id: number; title: string; retail_price: number; image_urls: string; brand: string; category: string }) {
  ecommerceStore.addToCartFromItem(item)
}

onMounted(async () => {
  await ecommerceStore.loadInitialData()
})
</script>
