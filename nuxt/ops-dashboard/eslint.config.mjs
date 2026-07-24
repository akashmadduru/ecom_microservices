// Standalone flat ESLint config. Uses the Nuxt-generated flat config as a base
// (via @nuxt/eslint), which already wires up Vue + TypeScript rules. This file
// intentionally shares nothing with vue/eslint.config.ts.
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt()
