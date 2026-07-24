<template>
  <div class="min-h-screen px-4 py-10 text-base-content">
    <div class="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside class="card h-fit">
        <div class="card-body space-y-4">
          <p class="section-kicker">Admin</p>

          <nav v-for="section in sections" :key="section.heading" class="space-y-1">
            <p class="px-3 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-base-content/40">
              {{ section.heading }}
            </p>
            <router-link v-for="item in section.items" :key="item.to" :to="item.to" class="nav-link"
              :class="isActive(item) ? 'nav-link-active' : ''">
              {{ item.label }}
            </router-link>
          </nav>

          <div class="divider-soft pt-3">
            <router-link to="/"
              class="block rounded-lg px-3 py-2 text-sm text-subtle transition-colors hover:bg-base-200 hover:text-base-content">
              ← Back to store
            </router-link>
          </div>
        </div>
      </aside>

      <section class="space-y-6">
        <AdminBreadcrumbs />
        <router-view />
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router'
import AdminBreadcrumbs from '@/components/admin/AdminBreadcrumbs.vue'

interface NavItem {
  to: string
  label: string
  /** Route names that mark this item active — guarantees exactly one active item per route. */
  names: string[]
}

interface NavSection {
  heading: string
  items: NavItem[]
}

const route = useRoute()

const sections: NavSection[] = [
  {
    heading: 'Overview',
    items: [{ to: '/admin', label: 'Dashboard', names: ['admin-dashboard'] }],
  },
  {
    heading: 'Catalog',
    items: [
      { to: '/admin/products', label: 'Products', names: ['admin-products', 'admin-product-create', 'admin-product-edit'] },
      { to: '/admin/brands', label: 'Brands', names: ['admin-brands', 'admin-brand-create', 'admin-brand-edit'] },
      { to: '/admin/manufacturers', label: 'Manufacturers', names: ['admin-manufacturers', 'admin-manufacturer-create', 'admin-manufacturer-edit'] },
      { to: '/admin/tags', label: 'Tags', names: ['admin-tags', 'admin-tag-create', 'admin-tag-edit'] },
    ],
  },
  {
    heading: 'Inventory',
    items: [
      { to: '/admin/inventory', label: 'Inventory', names: ['admin-inventory', 'admin-inventory-create', 'admin-inventory-detail'] },
      { to: '/admin/inventory/bulk-update', label: 'Bulk update', names: ['admin-inventory-bulk-update'] },
      { to: '/admin/inventory/health-report', label: 'Health report', names: ['admin-inventory-health-report'] },
      { to: '/admin/inventory/reports', label: 'Stock reports', names: ['admin-inventory-reports'] },
    ],
  },
  {
    heading: 'System',
    items: [{ to: '/admin/diagnostics', label: 'Diagnostics', names: ['admin-diagnostics'] }],
  },
]

function isActive(item: NavItem): boolean {
  return typeof route.name === 'string' && item.names.includes(route.name)
}
</script>
