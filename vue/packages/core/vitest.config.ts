import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      // Lets `core`'s own source import itself the same way its consumers do
      // (e.g. `import { buildPagination } from 'core/utils/pagination'`).
      core: fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    // `stores/notification.ts` calls `window.setTimeout`, so plain `node`
    // isn't enough — this package needs the same jsdom environment as the
    // apps that consume it.
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
  },
})
