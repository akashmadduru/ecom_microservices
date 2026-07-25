import { assertValidResourceId } from '../../../../runtime/container-request'
import { runNetworkRemoval } from '../../../../runtime/resource-mutation-guard'

/**
 * Remove ONE network. Gated by the global kill switch + the
 * `com.docker.compose.network` label allowlist (`OPS_MANAGED_NETWORKS`)
 * inside `runNetworkRemoval`. Same `id` form as `networks/[id].get.ts`
 * (Phase 4).
 */
export default defineEventHandler(async (event) => {
  const id = assertValidResourceId(getRouterParam(event, 'id'))
  return await runNetworkRemoval(id)
})
