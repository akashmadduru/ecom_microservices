import { assertValidImageId } from '../../../../runtime/container-request'
import { runImageRemoval } from '../../../../runtime/resource-mutation-guard'

/**
 * Remove ONE image. Gated by the global kill switch + a fresh "zero live
 * container references" check inside `runImageRemoval` — see
 * `resource-mutation-guard.ts` for why images use an eligibility check
 * instead of a configured allowlist the way volumes/networks do.
 */
export default defineEventHandler(async (event) => {
  const id = assertValidImageId(getRouterParam(event, 'id'))
  return await runImageRemoval(id)
})
