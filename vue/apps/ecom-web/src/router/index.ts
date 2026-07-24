import { createRouter, createWebHistory } from 'vue-router'
import type { RouteLocationNormalized } from 'vue-router'
import HomeView from '../modules/HomeView.vue'

declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean
    requiresAdmin?: boolean
    breadcrumb?: string | ((route: RouteLocationNormalized) => string)
  }
}

import SigninPage from '../modules/SigninPage.vue'
import SignupPage from '../modules/SignupPage.vue'
import ProductsPage from '../modules/ProductsPage.vue'
import ProductPage from '../modules/ProductPage.vue'
import OrdersPage from '../modules/OrdersPage.vue'
import CartPage from '../modules/CartPage.vue'
import WishlistPage from '../modules/WishlistPage.vue'
import AddressPage from '../modules/AddressPage.vue'
import ProfilePage from '../modules/ProfilePage.vue'
import CheckoutPage from '../modules/CheckoutPage.vue'
import { authGuard } from './authGuard.ts'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
    },
    {
      path: '/products',
      name: 'products',
      component: ProductsPage,
    },
    {
      path: '/products/:id',
      name: 'product',
      component: ProductPage,
    },
    {
      path: '/signin',
      name: 'signin',
      component: SigninPage,
    },
    {
      path: '/signup',
      name: 'signup',
      component: SignupPage,
    },
    {
      path: '/orders',
      name: 'orders',
      component: OrdersPage,
      meta: { requiresAuth: true },
    },
    {
      path: '/cart',
      name: 'cart',
      component: CartPage,
    },
    {
      path: '/profile',
      name: 'profile',
      component: ProfilePage,
      meta: { requiresAuth: true },
    },
    {
      path: '/checkout',
      name: 'checkout',
      component: CheckoutPage,
      meta: { requiresAuth: true },
    },
    {
      path: '/wishlist',
      name: 'wishlist',
      component: WishlistPage,
    },
    {
      path: '/address',
      name: 'address',
      component: AddressPage,
      meta: { requiresAuth: true },
    },
  ],
})

router.beforeEach(authGuard)

export default router
