import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      // Lets `lib`'s own source import itself the same way its consumers do,
      // plus its (type-only in shipped code, but real in tests/fixtures)
      // dependency on `core`.
      lib: fileURLToPath(new URL('./src', import.meta.url)),
      core: fileURLToPath(new URL('../core/src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
  },
})
