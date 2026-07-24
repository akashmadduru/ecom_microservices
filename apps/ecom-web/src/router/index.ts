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
import { authGuard } from './authGuard'

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
    {
      path: '/admin',
      component: () => import('../modules/admin/AdminLayout.vue'),
      meta: { requiresAuth: true, requiresAdmin: true, breadcrumb: 'Dashboard' },
      children: [
        {
          path: '',
          name: 'admin-dashboard',
          component: () => import('../modules/admin/AdminDashboardPage.vue'),
        },
        {
          path: 'products',
          name: 'admin-products',
          component: () => import('../modules/admin/AdminProductsPage.vue'),
          meta: { breadcrumb: 'Products' },
        },
        {
          path: 'products/new',
          name: 'admin-product-create',
          component: () => import('../modules/admin/AdminProductFormPage.vue'),
          meta: { breadcrumb: 'New product' },
        },
        {
          path: 'products/:id/edit',
          name: 'admin-product-edit',
          component: () => import('../modules/admin/AdminProductFormPage.vue'),
          meta: { breadcrumb: (route) => `Edit product #${route.params.id}` },
        },
        {
          path: 'manufacturers',
          name: 'admin-manufacturers',
          component: () => import('../modules/admin/AdminManufacturersPage.vue'),
          meta: { breadcrumb: 'Manufacturers' },
        },
        {
          path: 'manufacturers/new',
          name: 'admin-manufacturer-create',
          component: () => import('../modules/admin/AdminManufacturerFormPage.vue'),
          meta: { breadcrumb: 'New manufacturer' },
        },
        {
          path: 'manufacturers/:id/edit',
          name: 'admin-manufacturer-edit',
          component: () => import('../modules/admin/AdminManufacturerFormPage.vue'),
          meta: { breadcrumb: (route) => `Edit manufacturer #${route.params.id}` },
        },
        {
          path: 'brands',
          name: 'admin-brands',
          component: () => import('../modules/admin/AdminBrandsPage.vue'),
          meta: { breadcrumb: 'Brands' },
        },
        {
          path: 'brands/new',
          name: 'admin-brand-create',
          component: () => import('../modules/admin/AdminBrandFormPage.vue'),
          meta: { breadcrumb: 'New brand' },
        },
        {
          path: 'brands/:id/edit',
          name: 'admin-brand-edit',
          component: () => import('../modules/admin/AdminBrandFormPage.vue'),
          meta: { breadcrumb: (route) => `Edit brand #${route.params.id}` },
        },
        {
          path: 'tags',
          name: 'admin-tags',
          component: () => import('../modules/admin/AdminTagsPage.vue'),
          meta: { breadcrumb: 'Tags' },
        },
        {
          path: 'tags/new',
          name: 'admin-tag-create',
          component: () => import('../modules/admin/AdminTagFormPage.vue'),
          meta: { breadcrumb: 'New tag' },
        },
        {
          path: 'tags/:id/edit',
          name: 'admin-tag-edit',
          component: () => import('../modules/admin/AdminTagFormPage.vue'),
          meta: { breadcrumb: (route) => `Edit tag #${route.params.id}` },
        },
        {
          path: 'inventory',
          name: 'admin-inventory',
          component: () => import('../modules/admin/AdminInventoryListPage.vue'),
          meta: { breadcrumb: 'Inventory' },
        },
        {
          path: 'inventory/new',
          name: 'admin-inventory-create',
          component: () => import('../modules/admin/AdminInventoryFormPage.vue'),
          meta: { breadcrumb: 'New inventory' },
        },
        {
          path: 'inventory/bulk-update',
          name: 'admin-inventory-bulk-update',
          component: () => import('../modules/admin/AdminInventoryBulkUpdatePage.vue'),
          meta: { breadcrumb: 'Bulk update' },
        },
        {
          path: 'inventory/health-report',
          name: 'admin-inventory-health-report',
          component: () => import('../modules/admin/AdminInventoryHealthReportPage.vue'),
          meta: { breadcrumb: 'Health report' },
        },
        {
          path: 'inventory/reports',
          name: 'admin-inventory-reports',
          component: () => import('../modules/admin/AdminInventoryStockReportsPage.vue'),
          meta: { breadcrumb: 'Stock reports' },
        },
        {
          path: 'inventory/:productId',
          name: 'admin-inventory-detail',
          component: () => import('../modules/admin/AdminInventoryDetailPage.vue'),
          meta: { breadcrumb: (route) => `Product #${route.params.productId}` },
        },
        {
          path: 'diagnostics',
          name: 'admin-diagnostics',
          component: () => import('../modules/admin/AdminDiagnosticsPage.vue'),
          meta: { breadcrumb: 'Diagnostics' },
        },
      ],
    },
  ],
})

router.beforeEach(authGuard)

export default router
