<template>
  <div class="min-h-screen px-4 py-10 text-base-content">
    <div class="mx-auto max-w-5xl space-y-6">
      <div class="card">
        <div class="card-body">
          <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p class="section-kicker section-kicker-sm">Account</p>
              <h1 class="text-3xl font-semibold text-base-content">{{ ecommerceStore.profile.name }}</h1>
              <p class="text-sm text-muted">{{ ecommerceStore.profile.email }}</p>
            </div>
            <button class="btn btn-outline">Edit profile</button>
          </div>
        </div>
      </div>

      <div class="grid gap-6 lg:grid-cols-2">
        <div class="card">
          <div class="card-body">
            <h2 class="text-xl font-semibold text-base-content">Profile details</h2>
            <div class="mt-4 space-y-3 text-sm">
              <div class="flex justify-between"><span>Phone</span><span>{{ ecommerceStore.profile.phone }}</span></div>
              <div class="flex justify-between"><span>Member since</span><span>{{ ecommerceStore.profile.memberSince
                  }}</span></div>
              <div class="flex justify-between"><span>Preferred payment</span><span>{{ ecommerceStore.profile.payment
                  }}</span></div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-body">
            <h2 class="text-xl font-semibold text-base-content">Loyalty perks</h2>
            <ul class="mt-4 space-y-2 text-sm text-muted">
              <li>• Free shipping on orders above ₹999</li>
              <li>• Early access to seasonal sales</li>
              <li>• Priority support for premium users</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useEcommerceStore } from '@/stores/ecommerce'

const ecommerceStore = useEcommerceStore()

onMounted(async () => {
  await ecommerceStore.loadInitialData()
})
</script>
