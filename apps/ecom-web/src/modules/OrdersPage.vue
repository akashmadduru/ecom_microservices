<template>
  <div class="min-h-screen px-4 py-10 text-base-content">
    <div class="mx-auto max-w-6xl space-y-6">
      <PageHeader eyebrow="Orders" title="Recent purchases"
        description="Every order is tracked in one place with a more detailed snapshot of your latest activity.">
        <template #action>
          <router-link class="btn btn-outline btn-sm" to="/products">Continue shopping</router-link>
        </template>
      </PageHeader>

      <div v-if="ecommerceStore.orders.length" class="data-panel">
        <table class="table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Date</th>
              <th>Status</th>
              <th>Items</th>
              <th>Total</th>
              <th>Tracking</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="order in ecommerceStore.orders" :key="order.id">
              <td class="font-semibold text-base-content">{{ order.id }}</td>
              <td>{{ order.date }}</td>
              <td>
                <span class="badge" :class="order.status === 'Delivered' ? 'badge-success' : 'badge-warning'">{{
                  order.status
                  }}</span>
              </td>
              <td>{{ order.items }}</td>
              <td>₹{{ order.total }}</td>
              <td>{{ order.tracking }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <EmptyState v-else title="No orders yet"
        description="Your completed purchases will appear here once you place an order." />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import PageHeader from '@/components/PageHeader.vue'
import EmptyState from '@/components/EmptyState.vue'
import { useEcommerceStore } from '@/stores/ecommerce'

const ecommerceStore = useEcommerceStore()

onMounted(async () => {
  await ecommerceStore.loadInitialData()
})
</script>
