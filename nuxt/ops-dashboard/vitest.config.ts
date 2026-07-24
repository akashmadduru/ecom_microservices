import { defineConfig } from 'vitest/config'

// Plain vitest for the server-side units (parsing + provider mapping). These
// need no Nuxt/Vue runtime, so we deliberately keep the config minimal and
// standalone rather than pulling in @nuxt/test-utils.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
})
