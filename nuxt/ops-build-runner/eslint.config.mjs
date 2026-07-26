// Standalone flat ESLint config -- plain typescript-eslint recommended rules,
// since there is no Nuxt/Vue app here to generate a base config from (unlike
// nuxt/ops-dashboard/eslint.config.mjs, which delegates to @nuxt/eslint).
// Shares nothing with vue/eslint.config.ts or nuxt/ops-dashboard/eslint.config.mjs.
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
)
