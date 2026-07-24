<template>
  <main class="min-h-screen px-4 py-10 text-base-content">
    <!-- Hero: bento-grid redesign (scoped to this section only). -->
    <section class="mx-auto max-w-6xl">
      <div class="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <!-- Headline / CTA tile -->
        <div class="bento-tile bento-tile-hero lg:col-span-3 lg:row-span-2">
          <span class="pointer-events-none absolute -right-6 top-8 h-20 w-20 rounded-full bg-accent/20"
            aria-hidden="true" />
          <span class="pointer-events-none absolute right-20 top-4 h-3 w-3 rounded-full bg-primary/40"
            aria-hidden="true" />
          <span class="pointer-events-none absolute -bottom-8 right-28 h-28 w-28 rounded-full bg-primary/10"
            aria-hidden="true" />
          <span class="pointer-events-none absolute bottom-12 right-10 h-2.5 w-2.5 rounded-full bg-base-content/20"
            aria-hidden="true" />
          <span class="pointer-events-none absolute left-1/2 top-2 h-2 w-2 rounded-full bg-secondary/50"
            aria-hidden="true" />

          <div class="eyebrow-pill w-fit">
            <span class="text-sm">✦</span>
            <span>New season drop</span>
          </div>

          <h1 class="max-w-xl text-5xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
            Thoughtfully designed essentials, delivered daily.
          </h1>

          <p class="max-w-md text-base text-muted">
            Browse curated electronics, travel gear, and home pieces all in one modern storefront.
          </p>

          <div class="hero-feature-callout">
            <span class="hero-feature-number">01</span>
            <span class="hero-connector" aria-hidden="true" />
            <span class="text-sm text-muted">Real catalog data, zero placeholders — every price and rating
              updates live.</span>
          </div>

          <div class="flex flex-wrap items-center gap-3">
            <router-link class="hero-cta-pill" to="/products">Shop now</router-link>
            <router-link class="hero-cta-arrow" to="/products" aria-label="Browse all products">
              <span aria-hidden="true">→</span>
            </router-link>
            <router-link class="btn btn-outline btn-sm ml-2" to="/signup">Create account</router-link>
          </div>
        </div>

        <!-- Top Rated tile -->
        <div class="bento-tile lg:col-span-1">
          <router-link class="bento-tile-link" to="/products" aria-label="Browse all products">↗</router-link>
          <p class="bento-tile-title">Top Rated</p>
          <div v-if="topRatedProducts.length" class="space-y-3">
            <router-link v-for="product in topRatedProducts" :key="product.id" :to="`/products/${product.id}`"
              class="flex items-center gap-3">
              <AppImage :src="product.image_urls" :alt="product.title"
                img-class="h-12 w-12 shrink-0 rounded-xl object-cover" />
              <span class="min-w-0">
                <span class="block truncate text-sm font-semibold">{{ product.title }}</span>
                <span class="block text-xs text-muted">⭐ {{ product.rating }} · ₹{{
                  getSellingPrice(product).toFixed(2) }}</span>
              </span>
            </router-link>
          </div>
          <p v-else-if="heroWidgetsLoading" class="text-sm text-subtle">Loading top-rated picks…</p>
          <p v-else class="text-sm text-subtle">No top-rated picks yet.</p>
        </div>

        <!-- Deals tile -->
        <div class="bento-tile lg:col-span-1">
          <router-link class="bento-tile-link" to="/products" aria-label="Browse all products">↗</router-link>
          <p class="bento-tile-title">Deals</p>
          <div v-if="dealProducts.length" class="space-y-3">
            <router-link v-for="product in dealProducts" :key="product.id" :to="`/products/${product.id}`"
              class="flex items-center gap-3">
              <AppImage :src="product.image_urls" :alt="product.title"
                img-class="h-12 w-12 shrink-0 rounded-xl object-cover" />
              <span class="min-w-0">
                <span class="block truncate text-sm font-semibold">{{ product.title }}</span>
                <span class="block text-xs text-muted">₹{{ getSellingPrice(product).toFixed(2) }} · {{
                  getDiscountPercent(product) }}% off</span>
              </span>
            </router-link>
          </div>
          <p v-else-if="heroWidgetsLoading" class="text-sm text-subtle">Loading deals…</p>
          <p v-else class="text-sm text-subtle">No active deals right now.</p>
        </div>

        <!-- Shop by Brand tile -->
        <div class="bento-tile lg:col-span-2">
          <router-link class="bento-tile-link" to="/products" aria-label="Browse all products">↗</router-link>
          <p class="bento-tile-title">Shop by Brand</p>
          <div v-if="brandsPreview.length" class="flex flex-wrap items-center gap-4">
            <div v-for="brand in brandsPreview" :key="brand.id" class="flex items-center gap-2">
              <AppImage v-if="brand.logo_url" :src="brand.logo_url" :alt="brand.name"
                img-class="h-8 w-8 rounded-full object-contain" />
              <span class="text-sm font-semibold">{{ brand.name }}</span>
            </div>
          </div>
          <p v-else-if="brandStore.loading" class="text-sm text-subtle">Loading brands…</p>
          <p v-else class="text-sm text-subtle">No brands available yet.</p>
        </div>

        <!-- Shop by Category tile -->
        <div class="bento-tile lg:col-span-2">
          <router-link class="bento-tile-link" to="/products" aria-label="Browse all products">↗</router-link>
          <p class="bento-tile-title">Shop by Category</p>
          <div v-if="categories.length" class="flex flex-wrap gap-2">
            <span v-for="category in categories" :key="category.id" class="eyebrow-pill eyebrow-pill-sm">{{
              category.name }}</span>
          </div>
          <p v-else-if="heroWidgetsLoading" class="text-sm text-subtle">Loading categories…</p>
          <p v-else class="text-sm text-subtle">No categories available yet.</p>
        </div>
      </div>
    </section>

    <section class="mx-auto mt-10 max-w-6xl">
      <PageHeader eyebrow="Featured" title="Bestsellers for the season"
        description="Every featured pick includes quick add-to-cart actions and a premium product card experience.">
        <template #action>
          <router-link class="btn btn-ghost btn-sm" to="/products">View all</router-link>
        </template>
      </PageHeader>

      <div class="mt-6 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <ProductCard v-for="product in featuredProducts" :key="product.id" :product="product" />
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useProductStore } from '@/stores/product'
import { useBrandStore } from '@/stores/brand'
import { getProducts } from '@/api/ProductsApi'
import { getCategories } from '@/api/CategoriesApi'
import ProductCard from '@/components/ProductCard.vue'
import PageHeader from '@/components/PageHeader.vue'
import AppImage from '@/components/AppImage.vue'
import type { Product } from '@/interfaces/product'
import type { Category } from '@/interfaces/category'
import { getSellingPrice, getDiscountPercent, hasDiscount } from '@/utils/pricing'

const productStore = useProductStore()
const brandStore = useBrandStore()

const featuredProducts = computed(() => productStore.products.slice(0, 4))
const brandsPreview = computed(() => brandStore.brands.slice(0, 3))

// Hero bento-grid supplementary widgets (Top Rated / Deals / Categories).
// Fetched directly through the api layer rather than through productStore's
// shared `products`/`activeFilters` state, so a rating-sorted slice and a
// discount-filtered slice for the hero never clobber the Bestsellers grid's
// default-sorted list below (both would otherwise fight over the same
// single-slot store state). Mirrors the best-effort enrichment pattern
// already used in ProductPage.vue: direct api calls, Promise.allSettled,
// silent per-widget fallback.
const topRatedProducts = ref<Product[]>([])
const dealProducts = ref<Product[]>([])
const categories = ref<Category[]>([])
const heroWidgetsLoading = ref(true)

async function loadHeroWidgets() {
  heroWidgetsLoading.value = true
  await Promise.allSettled([
    getProducts(1, 6, { sort: 'rating' })
      .then((response) => {
        topRatedProducts.value = response.products.slice(0, 2)
      })
      .catch(() => {
        // Tile is simply omitted when the lookup fails.
      }),
    getProducts(1, 20)
      .then((response) => {
        dealProducts.value = response.products.filter((product) => hasDiscount(product)).slice(0, 2)
      })
      .catch(() => {
        // Tile is simply omitted when the lookup fails.
      }),
    getCategories()
      .then((response) => {
        categories.value = response.slice(0, 4)
      })
      .catch(() => {
        // Tile is simply omitted when the lookup fails.
      }),
  ])
  heroWidgetsLoading.value = false
}

onMounted(() => {
  productStore.fetchProducts(1)
  brandStore.fetchBrands()
  loadHeroWidgets()
})
</script>
