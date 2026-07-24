import { fileURLToPath } from 'node:url'
import { mergeConfig, defineConfig, configDefaults } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      exclude: [...configDefaults.exclude, 'e2e/**'],
      root: fileURLToPath(new URL('./', import.meta.url)),
      // Spec files for shared code now live in the `lib`/`core` workspace packages
      // (outside this app's `src/`), so the default in-root glob is widened to
      // also collect them.
      include: [
        '**/*.{test,spec}.?(c|m)[jt]s?(x)',
        '../../packages/lib/src/**/*.{test,spec}.?(c|m)[jt]s?(x)',
        '../../packages/core/src/**/*.{test,spec}.?(c|m)[jt]s?(x)',
      ],
    },
  }),
)
