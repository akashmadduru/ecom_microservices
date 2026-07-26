// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  devtools: { enabled: false },
  modules: ['@nuxt/eslint'],
  css: ['~/assets/css/base.css'],

  // Pure SPA (no SSR). This is an internal ops tool: the operator token lives in
  // sessionStorage and is attached client-side, so there is nothing to server-
  // render and no hydration mismatch to worry about. The Nitro server still runs
  // for the /api/* routes; only the Vue app is client-rendered.
  ssr: false,

  // No `runtimeConfig` here on purpose: OPS_API_TOKEN / DOCKER_HOST / DOCKER_PORT
  // are read directly from `process.env` by `server/runtime/config.ts` (see its
  // docstring for why), so a `runtimeConfig` block would be inert and misleading
  // — editing it would have no effect on server behavior. `.env.example`
  // documents the three variables for operators.

  nitro: {
    // Phase 6: bundles server/generated/dockerfile-manifest.json (a build-time
    // artifact produced by scripts/snapshot-dockerfiles.mjs, gitignored, NOT
    // committed source) as a Nitro server asset, so its content is correctly
    // inlined into .output/server at build time — a plain runtime
    // fs.readFileSync() call would NOT survive Nitro's bundling, since the
    // bundler has no static visibility into an opaque runtime fs path. Read at
    // runtime via `useStorage('assets:generated')` in
    // server/runtime/dockerfile-registry.ts. Missing file -> empty asset list
    // -> that module's own graceful "no entries" fallback, not a crash.
    serverAssets: [{ baseName: 'generated', dir: './generated' }],
  },
})
