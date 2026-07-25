/**
 * Shared "prune unused" button state machine for the images/volumes/networks
 * list pages (confirm → busy → call → refresh, surfacing any error). Prune
 * has no per-target eligibility gate (unlike row-level Remove) — only the
 * global mutation switch — so the only thing that varies per resource type is
 * the confirm copy and which `useApiClient()` prune method to call. Factored
 * out to remove three near-identical copies of this logic (one per page).
 */
export function usePruneAction(options: {
  confirmMessage: string
  errorFallback: string
  prune: () => Promise<unknown>
  refresh: () => Promise<unknown>
}) {
  const pruning = ref(false)
  const pruneError = ref('')

  async function run(): Promise<void> {
    if (pruning.value) return
    if (!window.confirm(options.confirmMessage)) return
    pruning.value = true
    pruneError.value = ''
    try {
      await options.prune()
      await options.refresh()
    } catch (err) {
      pruneError.value = err instanceof Error ? err.message : options.errorFallback
    } finally {
      pruning.value = false
    }
  }

  return { pruning, pruneError, run }
}
