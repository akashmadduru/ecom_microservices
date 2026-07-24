<template>
  <div class="min-h-screen px-4 py-10 text-base-content">
    <div class="mx-auto max-w-6xl space-y-6">
      <PageHeader eyebrow="Addresses" title="Manage your saved addresses"
        description="Keep delivery details handy for faster future checkout experiences." />

      <div class="grid gap-6 lg:grid-cols-2">
        <div v-for="address in ecommerceStore.addresses" :key="address.id"
          class="card">
          <div class="card-body">
            <div class="flex items-center justify-between">
              <h2 class="card-title text-base-content">{{ address.label }}</h2>
              <span class="badge badge-outline">{{ address.type }}</span>
            </div>
            <p class="text-sm text-muted">{{ address.street }}</p>
            <p class="text-sm text-muted">{{ address.city }} · {{ address.state }} · {{ address.pincode }}</p>
            <p class="text-sm text-muted">Phone: {{ address.phone }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import PageHeader from '@/components/PageHeader.vue'
import { useEcommerceStore } from '@/stores/ecommerce'

const ecommerceStore = useEcommerceStore()

onMounted(async () => {
  await ecommerceStore.loadInitialData()
})
</script>
