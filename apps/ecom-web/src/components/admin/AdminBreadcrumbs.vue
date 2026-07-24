<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import type { RouteLocationMatched } from 'vue-router'

const route = useRoute()

interface Crumb {
  label: string
  to: string
}

const crumbs = computed<Crumb[]>(() =>
  route.matched
    .filter((match): match is RouteLocationMatched => Boolean(match.meta.breadcrumb))
    .map((match) => {
      const breadcrumb = match.meta.breadcrumb
      const label = typeof breadcrumb === 'function' ? breadcrumb(route) : (breadcrumb ?? '')
      return { label, to: match.path }
    }),
)
</script>

<template>
  <nav v-if="crumbs.length" aria-label="Breadcrumb" class="text-sm text-muted">
    <ol class="flex flex-wrap items-center gap-2">
      <li v-for="(crumb, index) in crumbs" :key="crumb.to" class="flex items-center gap-2">
        <span v-if="index > 0" class="text-base-content/40">/</span>
        <router-link v-if="index < crumbs.length - 1" :to="crumb.to" class="hover:text-base-content">
          {{ crumb.label }}
        </router-link>
        <span v-else class="font-semibold text-base-content">{{ crumb.label }}</span>
      </li>
    </ol>
  </nav>
</template>
