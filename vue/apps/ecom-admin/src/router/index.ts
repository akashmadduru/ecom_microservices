import { createRouter, createWebHistory } from 'vue-router'
import type { RouteLocationNormalized } from 'vue-router'

declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean
    requiresAdmin?: boolean
    breadcrumb?: string | ((route: RouteLocationNormalized) => string)
  }
}

import SigninPage from '../modules/SigninPage.vue'
import { authGuard } from './authGuard.ts'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/signin',
      name: 'signin',
      component: SigninPage,
    },
    {
      path: '/',
      component: () => import('../modules/AdminLayout.vue'),
      meta: { requiresAuth: true, requiresAdmin: true, breadcrumb: 'Dashboard' },
      children: [
        {
          path: '',
          name: 'admin-dashboard',
          component: () => import('../modules/AdminDashboardPage.vue'),
        },
        {
          path: 'products',
          name: 'admin-products',
          component: () => import('../modules/AdminProductsPage.vue'),
          meta: { breadcrumb: 'Products' },
        },
        {
          path: 'products/new',
          name: 'admin-product-create',
          component: () => import('../modules/AdminProductFormPage.vue'),
          meta: { breadcrumb: 'New product' },
        },
        {
          path: 'products/:id/edit',
          name: 'admin-product-edit',
          component: () => import('../modules/AdminProductFormPage.vue'),
          meta: { breadcrumb: (route) => `Edit product #${route.params.id}` },
        },
        {
          path: 'manufacturers',
          name: 'admin-manufacturers',
          component: () => import('../modules/AdminManufacturersPage.vue'),
          meta: { breadcrumb: 'Manufacturers' },
        },
        {
          path: 'manufacturers/new',
          name: 'admin-manufacturer-create',
          component: () => import('../modules/AdminManufacturerFormPage.vue'),
          meta: { breadcrumb: 'New manufacturer' },
        },
        {
          path: 'manufacturers/:id/edit',
          name: 'admin-manufacturer-edit',
          component: () => import('../modules/AdminManufacturerFormPage.vue'),
          meta: { breadcrumb: (route) => `Edit manufacturer #${route.params.id}` },
        },
        {
          path: 'brands',
          name: 'admin-brands',
          component: () => import('../modules/AdminBrandsPage.vue'),
          meta: { breadcrumb: 'Brands' },
        },
        {
          path: 'brands/new',
          name: 'admin-brand-create',
          component: () => import('../modules/AdminBrandFormPage.vue'),
          meta: { breadcrumb: 'New brand' },
        },
        {
          path: 'brands/:id/edit',
          name: 'admin-brand-edit',
          component: () => import('../modules/AdminBrandFormPage.vue'),
          meta: { breadcrumb: (route) => `Edit brand #${route.params.id}` },
        },
        {
          path: 'tags',
          name: 'admin-tags',
          component: () => import('../modules/AdminTagsPage.vue'),
          meta: { breadcrumb: 'Tags' },
        },
        {
          path: 'tags/new',
          name: 'admin-tag-create',
          component: () => import('../modules/AdminTagFormPage.vue'),
          meta: { breadcrumb: 'New tag' },
        },
        {
          path: 'tags/:id/edit',
          name: 'admin-tag-edit',
          component: () => import('../modules/AdminTagFormPage.vue'),
          meta: { breadcrumb: (route) => `Edit tag #${route.params.id}` },
        },
        {
          path: 'inventory',
          name: 'admin-inventory',
          component: () => import('../modules/AdminInventoryListPage.vue'),
          meta: { breadcrumb: 'Inventory' },
        },
        {
          path: 'inventory/new',
          name: 'admin-inventory-create',
          component: () => import('../modules/AdminInventoryFormPage.vue'),
          meta: { breadcrumb: 'New inventory' },
        },
        {
          path: 'inventory/bulk-update',
          name: 'admin-inventory-bulk-update',
          component: () => import('../modules/AdminInventoryBulkUpdatePage.vue'),
          meta: { breadcrumb: 'Bulk update' },
        },
        {
          path: 'inventory/health-report',
          name: 'admin-inventory-health-report',
          component: () => import('../modules/AdminInventoryHealthReportPage.vue'),
          meta: { breadcrumb: 'Health report' },
        },
        {
          path: 'inventory/reports',
          name: 'admin-inventory-reports',
          component: () => import('../modules/AdminInventoryStockReportsPage.vue'),
          meta: { breadcrumb: 'Stock reports' },
        },
        {
          path: 'inventory/:productId',
          name: 'admin-inventory-detail',
          component: () => import('../modules/AdminInventoryDetailPage.vue'),
          meta: { breadcrumb: (route) => `Product #${route.params.productId}` },
        },
        {
          path: 'diagnostics',
          name: 'admin-diagnostics',
          component: () => import('../modules/AdminDiagnosticsPage.vue'),
          meta: { breadcrumb: 'Diagnostics' },
        },
      ],
    },
  ],
})

router.beforeEach(authGuard)

export default router
