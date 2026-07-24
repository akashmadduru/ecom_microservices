import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { Product } from '@/interfaces/product'

export interface CartItem {
  id: number
  title: string
  retail_price: number
  quantity: number
  image_urls: string
  brand: string
  category: string
}

export interface WishlistItem {
  id: number
  title: string
  retail_price: number
  image_urls: string
  brand: string
  category: string
}

export interface Address {
  id: number
  label: string
  type: string
  street: string
  city: string
  state: string
  pincode: string
  phone: string
}

export interface OrderItem {
  id: string
  date: string
  status: string
  total: number
  items: number
  tracking: string
}

export interface ProfileData {
  name: string
  email: string
  phone: string
  memberSince: string
  payment: string
}

export interface ToastMessage {
  id: number
  title?: string
  message: string
  type: 'success' | 'info' | 'warning' | 'error'
}

export const useEcommerceStore = defineStore('ecommerce', () => {
  const cart = ref<CartItem[]>([])
  const wishlist = ref<WishlistItem[]>([])
  const orders = ref<OrderItem[]>([])
  const addresses = ref<Address[]>([])
  const profile = ref<ProfileData>({
    name: 'Guest User',
    email: 'guest@example.com',
    phone: '+91 9876543210',
    memberSince: '2026',
    payment: 'Card ending 4242',
  })
  const shippingAddressId = ref<number | null>(null)
  const paymentMethod = ref<'Card' | 'Cash on delivery' | 'Wallet'>('Card')
  const isLoaded = ref(false)
  const isProcessing = ref<Record<string, boolean>>({})
  const toasts = ref<ToastMessage[]>([])

  async function loadInitialData() {
    if (isLoaded.value) return

    const [cartResponse, wishlistResponse, ordersResponse, addressesResponse, profileResponse] =
      await Promise.all([
        fetch('/data/cart.json'),
        fetch('/data/wishlist.json'),
        fetch('/data/orders.json'),
        fetch('/data/addresses.json'),
        fetch('/data/profile.json'),
      ])

    cart.value = await cartResponse.json()
    wishlist.value = await wishlistResponse.json()
    orders.value = await ordersResponse.json()
    addresses.value = await addressesResponse.json()
    profile.value = await profileResponse.json()
    shippingAddressId.value = addresses.value[0]?.id ?? null
    isLoaded.value = true
  }

  function showToast(message: string, type: ToastMessage['type'] = 'success', title?: string) {
    const id = Date.now() + Math.floor(Math.random() * 1000)
    toasts.value.unshift({ id, title, message, type })
    window.setTimeout(() => removeToast(id), 3200)
  }

  function removeToast(id: number) {
    toasts.value = toasts.value.filter((toast) => toast.id !== id)
  }

  function addToCart(product: Product) {
    const existing = cart.value.find((item) => item.id === product.id)
    if (existing) {
      existing.quantity += 1
      showToast(`Updated quantity for ${product.title}.`, 'info')
      return
    }

    cart.value.push({
      id: product.id,
      title: product.title,
      retail_price: product.retail_price,
      quantity: 1,
      image_urls: product.image_urls,
      brand: product.brand,
      category: product.category,
    })
    showToast(`Added ${product.title} to cart.`, 'success')
  }

  function addToCartFromItem(item: {
    id: number
    title: string
    retail_price: number
    image_urls: string
    brand?: string
    category?: string
  }) {
    // lightweight adapter when product object isn't available
    const existing = cart.value.find((c) => c.id === item.id)
    if (existing) {
      existing.quantity += 1
      return
    }

    cart.value.push({
      id: item.id,
      title: item.title,
      retail_price: item.retail_price,
      quantity: 1,
      image_urls: item.image_urls,
      brand: item.brand ?? 'Unknown',
      category: item.category ?? 'General',
    })
    showToast(`Added ${item.title} to cart.`, 'success')
  }

  function removeFromCart(productId: number) {
    cart.value = cart.value.filter((item) => item.id !== productId)
  }

  function updateQuantity(productId: number, quantity: number) {
    const target = cart.value.find((item) => item.id === productId)
    if (!target) return

    if (quantity <= 0) {
      removeFromCart(productId)
      return
    }

    target.quantity = quantity
  }

  function toggleWishlist(product: Product) {
    const existing = wishlist.value.find((item) => item.id === product.id)
    if (existing) {
      wishlist.value = wishlist.value.filter((item) => item.id !== product.id)
      showToast(`Removed ${product.title} from wishlist.`, 'warning')
      return
    }

    wishlist.value.push({
      id: product.id,
      title: product.title,
      retail_price: product.retail_price,
      image_urls: product.image_urls,
      brand: product.brand,
      category: product.category,
    })
    showToast(`Saved ${product.title} to wishlist.`, 'success')
  }

  function removeFromWishlist(productId: number) {
    wishlist.value = wishlist.value.filter((item) => item.id !== productId)
  }

  function setShippingAddress(addressId: number) {
    shippingAddressId.value = addressId
  }

  function setPaymentMethod(method: 'Card' | 'Cash on delivery' | 'Wallet') {
    paymentMethod.value = method
  }

  function placeOrder() {
    if (!cart.value.length) return null

    const newOrder: OrderItem = {
      id: `ORD-${Date.now()}`,
      date: new Date().toISOString().split('T')[0] as string,
      status: 'Processing',
      total: total.value,
      items: cart.value.reduce((sum, item) => sum + item.quantity, 0),
      tracking: `TRK-${Math.floor(Math.random() * 9000) + 1000}`,
    }

    orders.value.unshift(newOrder)
    cart.value = []
    showToast(`Order ${newOrder.id} placed successfully!`, 'success')
    return newOrder
  }

  function resetProfile() {
    profile.value = {
      name: 'Guest User',
      email: 'guest@example.com',
      phone: '+91 9876543210',
      memberSince: '2026',
      payment: 'Card ending 4242',
    }
  }

  const subtotal = computed(() =>
    cart.value.reduce((sum, item) => sum + item.retail_price * item.quantity, 0),
  )
  const shipping = computed(() => (subtotal.value >= 999 ? 0 : 49))
  const tax = computed(() => Math.round(subtotal.value * 0.08))
  const total = computed(() => subtotal.value + shipping.value + tax.value)
  const selectedAddress = computed(() =>
    addresses.value.find((address) => address.id === shippingAddressId.value),
  )

  return {
    cart,
    wishlist,
    orders,
    addresses,
    profile,
    shippingAddressId,
    paymentMethod,
    isLoaded,
    subtotal,
    shipping,
    tax,
    total,
    selectedAddress,
    loadInitialData,
    addToCart,
    addToCartFromItem,
    removeFromCart,
    updateQuantity,
    toggleWishlist,
    removeFromWishlist,
    setShippingAddress,
    setPaymentMethod,
    placeOrder,
    isProcessing,
    toasts,
    showToast,
    removeToast,
    resetProfile,
  }
})
