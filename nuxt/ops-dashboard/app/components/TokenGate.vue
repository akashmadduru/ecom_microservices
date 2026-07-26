<script setup lang="ts">
/**
 * Blocks the app until the operator pastes a token. Stored to sessionStorage
 * (via useApiToken) on submit — never read from a build-time env var, never
 * persisted to localStorage.
 */
const { hasToken, set } = useApiToken()
const input = ref('')

function submit(): void {
  if (input.value.trim()) {
    set(input.value)
    input.value = ''
  }
}
</script>

<template>
  <div v-if="!hasToken" class="gate">
    <form class="gate__card" @submit.prevent="submit">
      <h1 class="gate__title">Ops Dashboard</h1>
      <p class="gate__hint">
        Paste your operator token to continue. It is kept in this tab's
        sessionStorage only and sent as a Bearer header on every request.
      </p>
      <input
        v-model="input"
        type="password"
        class="gate__input"
        placeholder="OPS_API_TOKEN"
        autocomplete="off"
        autofocus
      >
      <button type="submit" class="gate__button" :disabled="!input.trim()">
        Continue
      </button>
    </form>
  </div>
  <slot v-else />
</template>

<style scoped>
.gate {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 1rem;
}
.gate__card {
  width: 100%;
  max-width: 24rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1.5rem;
  border: 1px solid var(--border);
  border-radius: 0.75rem;
  background: var(--surface);
}
.gate__title {
  margin: 0;
  font-size: 1.25rem;
}
.gate__hint {
  margin: 0;
  color: var(--muted);
  font-size: 0.8rem;
  line-height: 1.4;
}
.gate__input {
  padding: 0.6rem 0.75rem;
  border-radius: 0.5rem;
  border: 1px solid var(--border);
  background: var(--bg);
  color: inherit;
  font: inherit;
}
.gate__button {
  padding: 0.6rem 0.75rem;
  border-radius: 0.5rem;
  border: none;
  background: var(--accent);
  color: white;
  font-weight: 600;
  cursor: pointer;
}
.gate__button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
