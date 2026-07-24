<template>
  <div class="min-h-screen px-4 py-10 text-base-content">
    <div class="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <div class="space-y-6">
        <PageHeader eyebrow="Checkout" title="Secure your order"
          description="Choose a delivery address, select a payment method, and confirm your purchase in a single step." />

        <section class="surface-card">
          <div class="mb-4 flex items-center justify-between">
            <h2 class="text-xl font-semibold">Delivery address</h2>
            <router-link class="text-sm text-primary" to="/address">Manage addresses</router-link>
          </div>
          <div class="space-y-3">
            <label v-for="address in ecommerceStore.addresses" :key="address.id"
              class="flex cursor-pointer items-start gap-3 rounded-[1.1rem] border border-base-300 bg-base-200 p-4">
              <input v-model="selectedAddressId" :value="address.id" type="radio" class="radio radio-primary mt-1" />
              <div>
                <div class="flex items-center gap-2">
                  <span class="font-semibold">{{ address.label }}</span>
                  <span class="badge badge-outline">{{ address.type }}</span>
                </div>
                <p class="text-sm text-muted">{{ address.street }}</p>
                <p class="text-sm text-muted">{{ address.city }} · {{ address.state }} · {{
                  address.pincode }}</p>
              </div>
            </label>
          </div>
        </section>

        <section class="surface-card">
          <h2 class="mb-4 text-xl font-semibold">Payment method</h2>
          <div class="grid gap-3 md:grid-cols-3">
            <button v-for="method in methods" :key="method"
              class="rounded-[1.1rem] border px-4 py-3 text-left transition"
              :class="ecommerceStore.paymentMethod === method ? 'border-primary bg-accent/15 font-semibold text-primary' : 'border-base-300 bg-base-200 text-base-content/80'"
              @click="ecommerceStore.setPaymentMethod(method)">
              {{ method }}
            </button>
          </div>
        </section>
      </div>

      <aside class="surface-card">
        <h2 class="text-xl font-semibold">Order summary</h2>
        <div class="mt-4 space-y-3">
          <div v-for="item in ecommerceStore.cart" :key="item.id"
            class="flex items-center justify-between rounded-[1rem] border border-base-300 bg-base-200 px-3 py-2">
            <div>
              <p class="font-medium">{{ item.title }}</p>
              <p class="text-sm text-muted">Qty {{ item.quantity }}</p>
            </div>
            <p class="font-semibold">₹{{ item.retail_price * item.quantity }}</p>
          </div>
        </div>
        <div class="mt-6 space-y-2 text-sm">
          <div class="flex justify-between"><span>Subtotal</span><span>₹{{ ecommerceStore.subtotal }}</span>
          </div>
          <div class="flex justify-between"><span>Shipping</span><span>₹{{ ecommerceStore.shipping }}</span>
          </div>
          <div class="flex justify-between"><span>Tax</span><span>₹{{ ecommerceStore.tax }}</span></div>
          <div class="mt-3 flex justify-between border-t border-base-300 pt-3 text-base font-semibold">
            <span>Total</span><span>₹{{ ecommerceStore.total }}</span>
          </div>
        </div>
        <button class="btn btn-primary mt-6 w-full" @click="confirmOrder">Place order</button>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '@/components/PageHeader.vue'
import { useEcommerceStore } from '@/stores/ecommerce'

const ecommerceStore = useEcommerceStore()
const router = useRouter()
const methods = ['Card', 'Cash on delivery', 'Wallet'] as const
const selectedAddressId = ref<number | null>(null)

const selectedAddress = computed(() => ecommerceStore.addresses.find((address) => address.id === selectedAddressId.value))

onMounted(async () => {
  await ecommerceStore.loadInitialData()
  selectedAddressId.value = ecommerceStore.shippingAddressId ?? ecommerceStore.addresses[0]?.id ?? null
  if (selectedAddressId.value) {
    ecommerceStore.setShippingAddress(selectedAddressId.value)
  }
})

function confirmOrder() {
  if (!selectedAddress.value) {
    ecommerceStore.showToast('Please choose a delivery address.', 'warning')
    return
  }

  const order = ecommerceStore.placeOrder()
  if (!order) {
    ecommerceStore.showToast('Your cart is empty.', 'warning')
    return
  }

  router.push('/orders')
}
</script>
