<script setup lang="ts">
const { load, hasToken, clear } = useApiToken()

// Load any token stashed in this tab's sessionStorage on first mount.
onMounted(load)

const navItems = [
  { to: '/containers', label: 'Containers' },
  { to: '/images', label: 'Images' },
  { to: '/networks', label: 'Networks' },
  { to: '/volumes', label: 'Volumes' },
  { to: '/dockerfiles', label: 'Dockerfiles' },
  { to: '/health', label: 'Health' },
]
</script>

<template>
  <TokenGate>
    <div class="shell">
      <header class="shell__header">
        <NuxtLink to="/containers" class="shell__brand">Ops Dashboard</NuxtLink>
        <nav class="shell__nav">
          <NuxtLink
            v-for="item in navItems"
            :key="item.to"
            :to="item.to"
            class="shell__link"
            active-class="shell__link--active"
          >
            {{ item.label }}
          </NuxtLink>
        </nav>
        <button v-if="hasToken" type="button" class="shell__signout" @click="clear">
          Forget token
        </button>
      </header>
      <main class="shell__main">
        <NuxtPage />
      </main>
    </div>
  </TokenGate>
</template>

<style>
:root {
  color-scheme: light;
  --bg: #ffffff;
  --surface: #f6f8fa;
  --border: #d8dee6;
  --text: #1b1f24;
  --muted: #5b6673;
  --accent: #0969da;
  --error: #cf222e;
  --success: #1a7f37;
  --warning: #9a6700;
  --row-hover: #f0f3f6;
}
* {
  box-sizing: border-box;
}
html,
body,
#__nuxt {
  margin: 0;
  min-height: 100vh;
}
body {
  background: var(--bg);
  color: var(--text);
  font-family:
    ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
}
a {
  color: inherit;
  text-decoration: none;
}
</style>

<style scoped>
.shell__header {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  padding: 0.75rem 1.5rem;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
}
.shell__brand {
  font-weight: 700;
}
.shell__nav {
  display: flex;
  gap: 1rem;
}
.shell__link {
  color: var(--muted);
  font-size: 0.9rem;
  padding: 0.25rem 0;
  border-bottom: 2px solid transparent;
}
.shell__link--active {
  color: var(--text);
  border-bottom-color: var(--accent);
}
.shell__signout {
  margin-left: auto;
  background: transparent;
  border: 1px solid var(--border);
  color: var(--muted);
  border-radius: 0.4rem;
  padding: 0.3rem 0.6rem;
  cursor: pointer;
  font-size: 0.8rem;
}
.shell__main {
  padding: 1.5rem;
  max-width: 80rem;
  margin: 0 auto;
}
</style>
