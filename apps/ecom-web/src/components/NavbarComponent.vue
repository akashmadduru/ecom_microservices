<template>
  <div class="navbar mx-auto w-[95%] max-w-7xl px-4">
    <div class="flex-1">
      <router-link to="/" class="btn btn-ghost text-xl font-semibold">Ecommerce</router-link>
    </div>

    <div class="flex items-center gap-2">
      <router-link class="btn btn-ghost btn-circle btn-sm" to="/products" aria-label="Products" title="Products">
        <span class="text-lg">🛍️</span>
      </router-link>
      <router-link class="btn btn-ghost btn-circle btn-sm relative" to="/wishlist" aria-label="Wishlist"
        title="Wishlist">
        <span class="text-lg">♡</span>
        <span v-if="wishlistCount" class="badge badge-primary badge-xs absolute -right-2 -top-2">{{ wishlistCount
          }}</span>
      </router-link>
      <router-link class="btn btn-ghost btn-circle btn-sm relative" to="/cart" aria-label="Cart" title="Cart">
        <span class="text-lg">🛒</span>
        <span v-if="cartCount" class="badge badge-primary badge-xs absolute -right-2 -top-2">{{ cartCount }}</span>
      </router-link>

      <details v-if="authStore.isAuthenticated" class="dropdown dropdown-end">
        <summary class="btn btn-ghost btn-circle btn-sm p-0">
          <div
            class="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary to-neutral text-sm font-semibold text-primary-content">
            {{ initials }}
          </div>
        </summary>
        <ul
          class="menu dropdown-content z-[1] mt-3 w-48 rounded-box border border-base-300 bg-base-100 p-2 shadow-soft">
          <li><router-link to="/profile">Profile</router-link></li>
          <li><router-link to="/orders">Orders</router-link></li>
          <li><router-link to="/address">Addresses</router-link></li>
          <li v-if="authStore.isAdmin"><router-link to="/admin">Admin</router-link></li>
          <li><button @click="handleLogout">Logout</button></li>
        </ul>
      </details>

      <router-link v-else class="btn btn-primary btn-circle btn-sm" to="/signin" aria-label="Login" title="Login">
        <span class="text-base">🔐</span>
      </router-link>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useEcommerceStore } from '@/stores/ecommerce'
import { useAuthStore } from '@/stores/auth'

const store = useEcommerceStore()
const authStore = useAuthStore()
const router = useRouter()

const cartCount = computed(() => store.cart.reduce((s, i) => s + i.quantity, 0))
const wishlistCount = computed(() => store.wishlist.length)
const initials = computed(() => {
  const name = authStore.user?.username || store.profile.name || 'User'
  return name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
})

async function handleLogout() {
  await authStore.signOutUser()
  store.resetProfile()
  router.push('/')
}
</script>
