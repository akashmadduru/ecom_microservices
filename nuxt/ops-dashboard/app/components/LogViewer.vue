<script setup lang="ts">
/**
 * Live log viewer. Uses fetch() + a ReadableStream reader rather than
 * EventSource, because EventSource cannot attach an Authorization header and the
 * token must travel in a header (never a query string).
 */
const props = defineProps<{ containerId: string }>()

const api = useApiClient()
const lines = ref<string[]>([])
const connected = ref(false)
const error = ref<string | null>(null)
const tail = ref(200)
const timestamps = ref(false)

let controller: AbortController | null = null

function reset(): void {
  lines.value = []
  error.value = null
}

async function start(): Promise<void> {
  stop()
  reset()
  controller = new AbortController()
  const url = api.logsUrl(props.containerId, { tail: tail.value, timestamps: timestamps.value })

  try {
    const res = await fetch(url, {
      headers: api.authHeaders(),
      signal: controller.signal,
    })
    if (!res.ok || !res.body) {
      error.value = `Stream failed: ${res.status} ${res.statusText}`
      return
    }
    connected.value = true

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      // SSE events are separated by a blank line.
      const events = buffer.split('\n\n')
      buffer = events.pop() ?? ''
      for (const evt of events) {
        // Ignore heartbeat comments (lines starting with ':').
        const dataLines = evt
          .split('\n')
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.slice(5).replace(/^ /, ''))
        if (dataLines.length > 0) {
          lines.value.push(dataLines.join('\n'))
          if (lines.value.length > 5000) {
            lines.value.splice(0, lines.value.length - 5000)
          }
        }
      }
    }
  } catch (err: unknown) {
    if ((err as Error)?.name !== 'AbortError') {
      error.value = (err as Error)?.message ?? 'Stream error'
    }
  } finally {
    connected.value = false
  }
}

function stop(): void {
  if (controller) {
    controller.abort()
    controller = null
  }
  connected.value = false
}

onBeforeUnmount(stop)
</script>

<template>
  <section class="logs">
    <div class="logs__controls">
      <label>
        Tail
        <input v-model.number="tail" type="number" min="1" max="5000" class="logs__num">
      </label>
      <label class="logs__check">
        <input v-model="timestamps" type="checkbox"> timestamps
      </label>
      <button v-if="!connected" type="button" @click="start">Stream logs</button>
      <button v-else type="button" @click="stop">Stop</button>
      <span class="logs__status" :class="{ 'logs__status--live': connected }">
        {{ connected ? 'live' : 'idle' }}
      </span>
    </div>
    <p v-if="error" class="logs__error">{{ error }}</p>
    <pre class="logs__output"><code v-for="(line, i) in lines" :key="i">{{ line }}
</code></pre>
  </section>
</template>

<style scoped>
.logs {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.logs__controls {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.8rem;
}
.logs__num {
  width: 5rem;
  margin-left: 0.25rem;
  background: #0b0e14;
  color: inherit;
  border: 1px solid #2a2f3a;
  border-radius: 0.35rem;
  padding: 0.2rem 0.4rem;
}
.logs__status {
  color: #9aa4b2;
}
.logs__status--live {
  color: #7ee787;
}
.logs__error {
  color: #ff7b72;
  font-size: 0.8rem;
}
.logs__output {
  margin: 0;
  max-height: 28rem;
  overflow: auto;
  background: #0b0e14;
  border: 1px solid #2a2f3a;
  border-radius: 0.5rem;
  padding: 0.75rem;
  font-size: 0.78rem;
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
