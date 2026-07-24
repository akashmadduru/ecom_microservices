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
  border: 1px solid #2a2f3a;
  border-radius: 0.75rem;
  background: #12161d;
}
.gate__title {
  margin: 0;
  font-size: 1.25rem;
}
.gate__hint {
  margin: 0;
  color: #9aa4b2;
  font-size: 0.8rem;
  line-height: 1.4;
}
.gate__input {
  padding: 0.6rem 0.75rem;
  border-radius: 0.5rem;
  border: 1px solid #2a2f3a;
  background: #0b0e14;
  color: inherit;
  font: inherit;
}
.gate__button {
  padding: 0.6rem 0.75rem;
  border-radius: 0.5rem;
  border: none;
  background: #2f81f7;
  color: white;
  font-weight: 600;
  cursor: pointer;
}
.gate__button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
