import { defineConfig } from 'vitest/config'

// Plain vitest, no framework-specific plugin: this is a standalone Node/TS
// service (no Nuxt/Vue), so there is nothing to bootstrap beyond the node
// test environment. Mirrors nuxt/ops-dashboard/vitest.config.ts's own
// "keep it minimal" rationale.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
})
