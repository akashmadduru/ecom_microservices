import { globalIgnores } from 'eslint/config'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import pluginVue from 'eslint-plugin-vue'
import pluginPlaywright from 'eslint-plugin-playwright'
import pluginVitest from '@vitest/eslint-plugin'
import pluginOxlint from 'eslint-plugin-oxlint'
import skipFormatting from 'eslint-config-prettier/flat'

// To allow more languages other than `ts` in `.vue` files, uncomment the following lines:
// import { configureVueProject } from '@vue/eslint-config-typescript'
// configureVueProject({ scriptLangs: ['ts', 'tsx'] })
// More info at https://github.com/vuejs/eslint-config-typescript/#advanced-setup

// Lives at the repo root (rather than inside `apps/ecom-web`) so its `files`/`ignores`
// globs can reach the shared `packages/lib` and `packages/core` workspace packages —
// ESLint's flat config refuses to lint files outside the directory containing the
// config file ("base path"), and those packages are siblings of `apps/ecom-web`, not
// descendants of it.
export default defineConfigWithVueTs(
  {
    name: 'app/files-to-lint',
    files: ['apps/**/*.{vue,ts,mts,tsx}', 'packages/**/*.{vue,ts,mts,tsx}'],
  },

  globalIgnores(['**/dist/**', '**/dist-ssr/**', '**/coverage/**']),

  ...pluginVue.configs['flat/essential'],
  vueTsConfigs.recommended,

  {
    ...pluginPlaywright.configs['flat/recommended'],
    files: ['apps/ecom-web/e2e/**/*.{test,spec}.{js,ts,jsx,tsx}'],
  },

  {
    ...pluginVitest.configs.recommended,
    files: ['apps/ecom-web/src/**/__tests__/*'],
  },

  // `Breadcrumbs` is an intentional single-word component name (promoted from
  // `AdminBreadcrumbs.vue` into the shared `lib` package, dropping the
  // now-inapplicable "Admin" prefix).
  {
    name: 'lib/single-word-component-names',
    files: ['packages/lib/src/components/Breadcrumbs.vue'],
    rules: {
      'vue/multi-word-component-names': ['error', { ignores: ['Breadcrumbs'] }],
    },
  },

  // `lib` is the UI-only shared package: it may reference `core` (the domain/logic
  // package) for *types* only (e.g. `ListControllerResult<T>`, `Pagination`) — never
  // a runtime value (store, API client, composable function). That keeps `lib`
  // reusable by any consumer without pulling in `core`'s Pinia/axios runtime wiring.
  {
    name: 'lib/no-core-runtime-imports',
    files: ['packages/lib/src/**/*.{ts,vue}'],
    // Test files are allowed to pull in real `core` values (e.g. `buildPagination`)
    // to build fixtures — the layering concern is about what `lib`'s shipped
    // runtime code depends on, not its test doubles.
    ignores: ['packages/lib/src/**/*.{spec,test}.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['core', 'core/*'],
              allowTypeImports: true,
              message:
                "lib may only import types from 'core' (use `import type`) — never a runtime value such as a store, API client, or composable.",
            },
          ],
        },
      ],
    },
  },

  // Resolved relative to the process cwd (this repo's lint script always runs
  // from `apps/ecom-web`, unlike the `files`/`ignores` globs above which are
  // resolved relative to this config file's own directory).
  ...pluginOxlint.buildFromOxlintConfigFile('.oxlintrc.json'),

  skipFormatting,
)
