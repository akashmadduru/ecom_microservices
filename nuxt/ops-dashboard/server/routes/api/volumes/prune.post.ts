import { runVolumePrune } from '../../../runtime/resource-mutation-guard'

/**
 * Prune all volumes Docker itself considers unused (zero active container
 * references). Gated by ONLY the global kill switch — no per-target
 * eligibility check; see `resource-mutation-guard.ts`'s prune section.
 */
export default defineEventHandler(async () => {
  return await runVolumePrune()
})
