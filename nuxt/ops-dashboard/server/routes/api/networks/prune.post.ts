import { runNetworkPrune } from '../../../runtime/resource-mutation-guard'

/**
 * Prune all networks Docker itself considers unused. Gated by ONLY the
 * global kill switch — no per-target eligibility check; see
 * `resource-mutation-guard.ts`'s prune section.
 */
export default defineEventHandler(async () => {
  return await runNetworkPrune()
})
