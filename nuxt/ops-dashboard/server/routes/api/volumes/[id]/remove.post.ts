import { assertValidResourceId } from '../../../../runtime/container-request'
import { runVolumeRemoval } from '../../../../runtime/resource-mutation-guard'

/**
 * Remove ONE volume. Gated by the global kill switch + the
 * `com.docker.compose.volume` label allowlist (`OPS_MANAGED_VOLUMES`) inside
 * `runVolumeRemoval`. Uses the same `id` form as `volumes/[id].get.ts`
 * (Phase 4) — the raw route param, passed straight through to
 * `RuntimeProvider.inspectVolume`, which decodes it internally in kubernetes
 * mode (this route itself never branches on backend).
 */
export default defineEventHandler(async (event) => {
  const id = assertValidResourceId(getRouterParam(event, 'id'))
  return await runVolumeRemoval(id)
})
