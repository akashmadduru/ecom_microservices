<template>
  <div class="space-y-8">
    <PageHeader eyebrow="Admin" title="Operations overview"
      description="Manage the product catalog and inventory backed by the live microservices." />

    <section v-for="group in groups" :key="group.heading" class="space-y-3">
      <h2 class="section-kicker">{{ group.heading }}</h2>
      <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <router-link v-for="link in group.links" :key="link.to" :to="link.to"
          class="card transition hover:-translate-y-0.5 hover:border-primary/40">
          <div class="card-body">
            <h3 class="text-lg font-semibold text-base-content">{{ link.title }}</h3>
            <p class="text-sm text-muted">{{ link.description }}</p>
          </div>
        </router-link>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import PageHeader from '@/components/PageHeader.vue'

interface DashboardLink {
  to: string
  title: string
  description: string
}

interface DashboardGroup {
  heading: string
  links: DashboardLink[]
}

const groups: DashboardGroup[] = [
  {
    heading: 'Catalog',
    links: [
      { to: '/admin/products', title: 'Products', description: 'Create, edit, delete, and seed the product catalog.' },
      { to: '/admin/brands', title: 'Brands', description: 'Manage the brands products are associated with.' },
      { to: '/admin/manufacturers', title: 'Manufacturers', description: 'Manage manufacturer records for the catalog.' },
      { to: '/admin/tags', title: 'Tags', description: 'Curate the tags used to classify products.' },
    ],
  },
  {
    heading: 'Inventory',
    links: [
      { to: '/admin/inventory', title: 'Inventory', description: 'Track stock, reserve/release, adjust, and restock.' },
      { to: '/admin/inventory/bulk-update', title: 'Bulk update', description: 'Update stock levels for many products at once.' },
      { to: '/admin/inventory/health-report', title: 'Health report', description: 'Overall inventory health across the catalog.' },
      { to: '/admin/inventory/reports', title: 'Stock reports', description: 'Low-stock and out-of-stock product reports.' },
    ],
  },
  {
    heading: 'System',
    links: [
      { to: '/admin/diagnostics', title: 'Diagnostics', description: 'Raw auth service diagnostics for troubleshooting.' },
    ],
  },
]
</script>
