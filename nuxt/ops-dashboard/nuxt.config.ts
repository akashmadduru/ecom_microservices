// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  devtools: { enabled: false },
  modules: ['@nuxt/eslint'],

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
})
