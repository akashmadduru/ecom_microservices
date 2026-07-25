import { runImagePrune } from '../../../runtime/resource-mutation-guard'

/**
 * Prune all dangling (untagged, unreferenced) images. Gated by ONLY the
 * global kill switch — there is no target, so there is no per-target
 * eligibility check (see `resource-mutation-guard.ts`'s prune section for why
 * this is intentional, not a missed gate). Docker's own engine-level prune
 * filter (`dangling: true`, hardcoded in `docker-resource-mutating-provider.ts`)
 * is the real backstop that keeps this "unused images only."
 */
export default defineEventHandler(async () => {
  return await runImagePrune()
})
